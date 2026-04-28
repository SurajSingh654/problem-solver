// ============================================================================
// ProbSolver v3.0 — Team Controller
// ============================================================================
//
// DESIGN DECISIONS:
//
// 1. TeamMembership is the authoritative record of team access.
//    User.teamRole is a denormalized cache for the current context only.
//    Every operation that changes membership MUST update both.
//
// 2. Team creation: Always starts in PENDING status. A join code is
//    NOT generated until the SUPER_ADMIN approves. This prevents
//    users from sharing codes for unapproved teams.
//
// 3. Approval flow: SUPER_ADMIN calls POST /teams/:id/review with
//    { action: 'approve' } or { action: 'reject', rejectionReason }.
//    On approval, a join code is generated, a TeamMembership record
//    is created for the creator, and they are switched to the team.
//
// 4. Join by code: Creates a TeamMembership record atomically with
//    the user context switch. Returns buildUserResponse so the client
//    immediately has updated memberships[].
//
// 5. Leave team: Deactivates TeamMembership (soft leave — history
//    is preserved). Switches user to personal space.
//
// 6. Role change: Updates BOTH User.teamRole (if currently in that
//    team) AND TeamMembership.role (authoritative source).
//
// 7. Remove member: Deactivates TeamMembership, switches them to
//    their personal space.
//
// ============================================================================
import crypto from "crypto";
import prisma from "../lib/prisma.js";
import { generateToken } from "../lib/jwt.js";
import {
  sendTeamInviteEmail,
  sendTeamApprovedEmail,
  sendTeamRejectedEmail,
} from "../services/email.service.js";
import { INVITATION_EXPIRY_HOURS } from "../config/env.js";
import { success, error } from "../utils/response.js";

// ── Helper: generate join code ───────────────────────────────
function generateJoinCode(length = 8) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  const bytes = crypto.randomBytes(length);
  for (let i = 0; i < length; i++) {
    code += chars[bytes[i] % chars.length];
  }
  return code;
}

// ── Helper: ensure unique join code ──────────────────────────
async function uniqueJoinCode() {
  let code;
  let exists = true;
  let attempts = 0;
  while (exists && attempts < 10) {
    code = generateJoinCode();
    const found = await prisma.team.findUnique({ where: { joinCode: code } });
    exists = !!found;
    attempts++;
  }
  if (exists) {
    throw new Error("Failed to generate unique join code after 10 attempts.");
  }
  return code;
}

// ── Helper: build complete user response with memberships ─────
// Reused from auth.controller pattern — keeps responses consistent.
async function buildUserResponse(userId) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      avatarUrl: true,
      globalRole: true,
      currentTeamId: true,
      teamRole: true,
      personalTeamId: true,
      onboardingComplete: true,
      mustChangePassword: true,
      isVerified: true,
      currentTeam: {
        select: { id: true, name: true, isPersonal: true, status: true },
      },
      personalTeam: {
        select: { id: true, name: true },
      },
      memberships: {
        where: { isActive: true },
        select: {
          role: true,
          joinedAt: true,
          team: {
            select: { id: true, name: true, isPersonal: true, status: true },
          },
        },
        orderBy: { joinedAt: "asc" },
      },
    },
  });
}

// ============================================================================
// CREATE TEAM
// ============================================================================
export async function createTeam(req, res) {
  try {
    const { name, description, maxMembers } = req.body;
    const userId = req.user.id;

    const existingPending = await prisma.team.findFirst({
      where: { createdById: userId, status: "PENDING", isPersonal: false },
      select: { id: true, name: true },
    });

    if (existingPending) {
      return error(
        res,
        `You already have a pending team "${existingPending.name}". Please wait for approval.`,
        400,
      );
    }

    const team = await prisma.team.create({
      data: {
        name,
        description: description || null,
        status: "PENDING",
        createdById: userId,
        maxMembers: maxMembers || 20,
        aiProblemsEnabled: true,
      },
      select: {
        id: true,
        name: true,
        description: true,
        status: true,
        maxMembers: true,
        createdAt: true,
      },
    });

    return success(
      res,
      { message: `Team "${name}" created and is pending approval.`, team },
      201,
    );
  } catch (err) {
    console.error("Create team error:", err);
    return error(res, "Failed to create team.", 500);
  }
}

// ============================================================================
// REVIEW TEAM (SUPER_ADMIN — approve/reject)
// ============================================================================
export async function reviewTeam(req, res) {
  try {
    const { teamId } = req.params;
    const { action, rejectionReason } = req.body;

    const team = await prisma.team.findUnique({
      where: { id: teamId },
      select: {
        id: true,
        name: true,
        status: true,
        createdById: true,
        createdBy: { select: { email: true, name: true } },
      },
    });

    if (!team) {
      return error(res, "Team not found.", 404);
    }
    if (team.status !== "PENDING") {
      return error(res, `Team is already ${team.status.toLowerCase()}.`, 400);
    }

    // ── APPROVE ────────────────────────────────────────
    if (action === "approve") {
      const joinCode = await uniqueJoinCode();

      const updatedTeam = await prisma.$transaction(async (tx) => {
        // Activate team with join code
        const approved = await tx.team.update({
          where: { id: teamId },
          data: { status: "ACTIVE", joinCode, approvedAt: new Date() },
          select: {
            id: true,
            name: true,
            status: true,
            joinCode: true,
            approvedAt: true,
          },
        });

        // Switch creator to this team
        await tx.user.update({
          where: { id: team.createdById },
          data: { currentTeamId: teamId, teamRole: "TEAM_ADMIN" },
        });

        // Create TeamMembership for the creator
        // upsert in case they somehow already have a record
        await tx.teamMembership.upsert({
          where: {
            userId_teamId: { userId: team.createdById, teamId },
          },
          create: {
            userId: team.createdById,
            teamId,
            role: "TEAM_ADMIN",
            isActive: true,
          },
          update: {
            role: "TEAM_ADMIN",
            isActive: true,
            leftAt: null,
          },
        });

        return approved;
      });

      sendTeamApprovedEmail(
        team.createdBy.email,
        team.createdBy.name,
        updatedTeam.name,
        joinCode,
      ).catch((err) => {
        console.error("Failed to send approval email:", err.message);
      });

      return success(res, {
        message: `Team "${updatedTeam.name}" approved.`,
        team: updatedTeam,
      });
    }

    // ── REJECT ─────────────────────────────────────────
    if (action === "reject") {
      const updatedTeam = await prisma.team.update({
        where: { id: teamId },
        data: {
          status: "REJECTED",
          rejectionReason: rejectionReason || "No reason provided.",
        },
        select: { id: true, name: true, status: true, rejectionReason: true },
      });

      sendTeamRejectedEmail(
        team.createdBy.email,
        team.createdBy.name,
        updatedTeam.name,
        updatedTeam.rejectionReason,
      ).catch((err) => {
        console.error("Failed to send rejection email:", err.message);
      });

      return success(res, {
        message: `Team "${updatedTeam.name}" rejected.`,
        team: updatedTeam,
      });
    }

    return error(res, "Invalid action.", 400);
  } catch (err) {
    console.error("Review team error:", err);
    return error(res, "Failed to review team.", 500);
  }
}

// ============================================================================
// JOIN TEAM BY CODE
// ============================================================================
export async function joinTeam(req, res) {
  try {
    const { joinCode } = req.body;
    const userId = req.user.id;

    const team = await prisma.team.findUnique({
      where: { joinCode },
      select: {
        id: true,
        name: true,
        status: true,
        maxMembers: true,
        isPersonal: true,
        _count: { select: { currentMembers: true } },
      },
    });

    if (!team) {
      return error(res, "Invalid join code.", 404);
    }
    if (team.isPersonal) {
      return error(res, "Cannot join a personal space.", 400);
    }
    if (team.status !== "ACTIVE") {
      return error(res, "This team is not accepting members.", 400);
    }
    if (team._count.currentMembers >= team.maxMembers) {
      return error(res, "This team is full.", 400);
    }

    // Check if user already has an active membership
    const existingMembership = await prisma.teamMembership.findUnique({
      where: { userId_teamId: { userId, teamId: team.id } },
      select: { isActive: true, role: true },
    });

    if (existingMembership?.isActive) {
      return error(res, "You are already a member of this team.", 400);
    }

    await prisma.$transaction(async (tx) => {
      // Update user context
      await tx.user.update({
        where: { id: userId },
        data: {
          currentTeamId: team.id,
          teamRole: "MEMBER",
        },
      });

      // Create or reactivate TeamMembership
      await tx.teamMembership.upsert({
        where: { userId_teamId: { userId, teamId: team.id } },
        create: {
          userId,
          teamId: team.id,
          role: "MEMBER",
          isActive: true,
        },
        update: {
          // Re-joining after leaving — restore as MEMBER, reset leftAt
          role: "MEMBER",
          isActive: true,
          leftAt: null,
        },
      });
    });

    const fullUser = await buildUserResponse(userId);
    const token = generateToken(fullUser);

    return success(res, {
      message: `Joined ${team.name}!`,
      token,
      user: fullUser,
      team: { id: team.id, name: team.name },
    });
  } catch (err) {
    console.error("Join team error:", err);
    return error(res, "Failed to join team.", 500);
  }
}

// ============================================================================
// LEAVE TEAM
// ============================================================================
export async function leaveTeam(req, res) {
  try {
    const userId = req.user.id;
    const teamId = req.teamId;

    if (req.isPersonalTeam) {
      return error(res, "Cannot leave your personal space.", 400);
    }

    // Check if last TEAM_ADMIN
    if (req.user.teamRole === "TEAM_ADMIN") {
      const otherAdmins = await prisma.user.count({
        where: {
          currentTeamId: teamId,
          teamRole: "TEAM_ADMIN",
          id: { not: userId },
        },
      });

      if (otherAdmins === 0) {
        const otherMembers = await prisma.user.count({
          where: { currentTeamId: teamId, id: { not: userId } },
        });

        if (otherMembers > 0) {
          return error(
            res,
            "You are the only admin. Please promote another member to admin before leaving.",
            400,
            "LAST_ADMIN",
          );
        }
      }
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { personalTeamId: true },
    });

    await prisma.$transaction(async (tx) => {
      // Switch to personal space
      await tx.user.update({
        where: { id: userId },
        data: {
          currentTeamId: user?.personalTeamId || null,
          teamRole: user?.personalTeamId ? "TEAM_ADMIN" : null,
        },
      });

      // Deactivate TeamMembership (soft leave — history preserved)
      await tx.teamMembership.updateMany({
        where: { userId, teamId, isActive: true },
        data: { isActive: false, leftAt: new Date() },
      });
    });

    const fullUser = await buildUserResponse(userId);
    const token = generateToken(fullUser);

    return success(res, {
      message: "You have left the team. Switched to individual mode.",
      token,
      user: fullUser,
    });
  } catch (err) {
    console.error("Leave team error:", err);
    return error(res, "Failed to leave team.", 500);
  }
}

// ============================================================================
// INVITE MEMBERS (TEAM_ADMIN)
// ============================================================================
export async function inviteMembers(req, res) {
  try {
    const { emails } = req.body;
    const teamId = req.teamId;
    const inviterId = req.user.id;

    const team = await prisma.team.findUnique({
      where: { id: teamId },
      select: { id: true, name: true, joinCode: true },
    });

    if (!team) {
      return error(res, "Team not found.", 404);
    }

    const results = { sent: [], skipped: [] };

    for (const email of emails) {
      // Check if already an active member
      const existingUser = await prisma.user.findUnique({
        where: { email },
        select: { id: true, currentTeamId: true },
      });

      if (existingUser) {
        const activeMembership = await prisma.teamMembership.findUnique({
          where: { userId_teamId: { userId: existingUser.id, teamId } },
          select: { isActive: true },
        });
        if (activeMembership?.isActive) {
          results.skipped.push({ email, reason: "Already a team member." });
          continue;
        }
      }

      // Check for existing pending invitation
      const existingInvite = await prisma.teamInvitation.findFirst({
        where: {
          teamId,
          email,
          status: "PENDING",
          expiresAt: { gt: new Date() },
        },
      });

      if (existingInvite) {
        results.skipped.push({ email, reason: "Invitation already pending." });
        continue;
      }

      const invitation = await prisma.teamInvitation.create({
        data: {
          teamId,
          email,
          invitedById: inviterId,
          status: "PENDING",
          expiresAt: new Date(
            Date.now() + INVITATION_EXPIRY_HOURS * 60 * 60 * 1000,
          ),
        },
      });

      sendTeamInviteEmail(
        email,
        team.name,
        team.joinCode,
        invitation.token,
      ).catch((err) => {
        console.error(`Failed to send invite to ${email}:`, err.message);
      });

      results.sent.push({ email });
    }

    return success(res, {
      message: `${results.sent.length} invitation(s) sent.`,
      results,
    });
  } catch (err) {
    console.error("Invite members error:", err);
    return error(res, "Failed to send invitations.", 500);
  }
}

// ============================================================================
// GET TEAM DETAILS
// ============================================================================
export async function getTeam(req, res) {
  try {
    const teamId = req.teamId;

    const team = await prisma.team.findUnique({
      where: { id: teamId },
      select: {
        id: true,
        name: true,
        description: true,
        avatarUrl: true,
        status: true,
        joinCode: true,
        isPersonal: true,
        maxMembers: true,
        aiProblemsEnabled: true,
        aiProblemConfig: true,
        createdById: true,
        createdAt: true,
        _count: {
          select: { currentMembers: true, problems: true, solutions: true },
        },
      },
    });

    if (!team) {
      return error(res, "Team not found.", 404);
    }

    const isAdmin =
      req.user.globalRole === "SUPER_ADMIN" ||
      req.user.teamRole === "TEAM_ADMIN";
    if (!isAdmin) {
      team.joinCode = undefined;
    }

    return success(res, { team });
  } catch (err) {
    console.error("Get team error:", err);
    return error(res, "Failed to fetch team details.", 500);
  }
}

// ============================================================================
// LIST TEAM MEMBERS
// ============================================================================
export async function getTeamMembers(req, res) {
  try {
    const teamId = req.teamId;

    const members = await prisma.user.findMany({
      where: { currentTeamId: teamId },
      select: {
        id: true,
        name: true,
        email: true,
        avatarUrl: true,
        teamRole: true,
        streak: true,
        lastActiveAt: true,
        activityStatus: true,
        createdAt: true,
      },
      orderBy: [{ teamRole: "asc" }, { lastActiveAt: "desc" }],
    });

    return success(res, { members, count: members.length });
  } catch (err) {
    console.error("Get team members error:", err);
    return error(res, "Failed to fetch team members.", 500);
  }
}

// ============================================================================
// UPDATE MEMBER ROLE (TEAM_ADMIN)
// ============================================================================
export async function changeMemberRole(req, res) {
  try {
    const { memberId } = req.params;
    const { role } = req.body;
    const teamId = req.teamId;

    if (memberId === req.user.id) {
      return error(res, "You cannot change your own role.", 400);
    }

    const member = await prisma.user.findFirst({
      where: { id: memberId, currentTeamId: teamId },
      select: { id: true, name: true, teamRole: true },
    });

    if (!member) {
      return error(res, "Member not found in this team.", 404);
    }

    // Update both User.teamRole (current context cache) AND
    // TeamMembership.role (authoritative source)
    await prisma.$transaction(async (tx) => {
      // Update denormalized cache on User
      await tx.user.update({
        where: { id: memberId },
        data: { teamRole: role },
      });

      // Update authoritative role in TeamMembership
      await tx.teamMembership.updateMany({
        where: { userId: memberId, teamId, isActive: true },
        data: { role },
      });
    });

    return success(res, {
      message: `${member.name} is now ${role === "TEAM_ADMIN" ? "a team admin" : "a member"}.`,
      member: { id: member.id, name: member.name, teamRole: role },
    });
  } catch (err) {
    console.error("Change member role error:", err);
    return error(res, "Failed to change member role.", 500);
  }
}

// ============================================================================
// REMOVE MEMBER (TEAM_ADMIN)
// ============================================================================
export async function removeMember(req, res) {
  try {
    const { memberId } = req.params;
    const teamId = req.teamId;

    if (memberId === req.user.id) {
      return error(res, "Use the leave endpoint to leave the team.", 400);
    }

    const member = await prisma.user.findFirst({
      where: { id: memberId, currentTeamId: teamId },
      select: { id: true, name: true, personalTeamId: true },
    });

    if (!member) {
      return error(res, "Member not found in this team.", 404);
    }

    await prisma.$transaction(async (tx) => {
      // Switch member to their personal space
      await tx.user.update({
        where: { id: memberId },
        data: {
          currentTeamId: member.personalTeamId || null,
          teamRole: member.personalTeamId ? "TEAM_ADMIN" : null,
        },
      });

      // Deactivate TeamMembership (soft remove — history preserved)
      await tx.teamMembership.updateMany({
        where: { userId: memberId, teamId, isActive: true },
        data: { isActive: false, leftAt: new Date() },
      });
    });

    return success(res, {
      message: `${member.name} has been removed from the team.`,
    });
  } catch (err) {
    console.error("Remove member error:", err);
    return error(res, "Failed to remove member.", 500);
  }
}

// ============================================================================
// REGENERATE JOIN CODE (TEAM_ADMIN)
// ============================================================================
export async function regenerateJoinCode(req, res) {
  try {
    const teamId = req.teamId;
    const newCode = await uniqueJoinCode();

    const team = await prisma.team.update({
      where: { id: teamId },
      data: { joinCode: newCode },
      select: { id: true, joinCode: true },
    });

    return success(res, {
      message: "Join code regenerated. The old code no longer works.",
      joinCode: team.joinCode,
    });
  } catch (err) {
    console.error("Regenerate join code error:", err);
    return error(res, "Failed to regenerate join code.", 500);
  }
}

// ============================================================================
// LIST PENDING TEAMS (SUPER_ADMIN)
// ============================================================================
export async function listPendingTeams(req, res) {
  try {
    const teams = await prisma.team.findMany({
      where: { status: "PENDING", isPersonal: false },
      select: {
        id: true,
        name: true,
        description: true,
        maxMembers: true,
        createdAt: true,
        createdBy: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: "asc" },
    });

    return success(res, { teams, count: teams.length });
  } catch (err) {
    console.error("List pending teams error:", err);
    return error(res, "Failed to fetch pending teams.", 500);
  }
}

// ============================================================================
// LIST ALL TEAMS (SUPER_ADMIN)
// ============================================================================
export async function listAllTeams(req, res) {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const where = { isPersonal: false };
    if (status) where.status = status;

    const [teams, total] = await Promise.all([
      prisma.team.findMany({
        where,
        select: {
          id: true,
          name: true,
          description: true,
          status: true,
          joinCode: true,
          maxMembers: true,
          createdAt: true,
          approvedAt: true,
          createdBy: { select: { id: true, name: true, email: true } },
          _count: {
            select: { currentMembers: true, problems: true, solutions: true },
          },
        },
        orderBy: { createdAt: "desc" },
        skip: (parseInt(page) - 1) * parseInt(limit),
        take: parseInt(limit),
      }),
      prisma.team.count({ where }),
    ]);

    return success(res, {
      teams,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (err) {
    console.error("List all teams error:", err);
    return error(res, "Failed to fetch teams.", 500);
  }
}

// ============================================================================
// UPDATE TEAM (TEAM_ADMIN)
// ============================================================================
export async function updateTeam(req, res) {
  try {
    const teamId = req.teamId;
    const data = req.body;

    const team = await prisma.team.update({
      where: { id: teamId },
      data,
      select: {
        id: true,
        name: true,
        description: true,
        avatarUrl: true,
        maxMembers: true,
        aiProblemsEnabled: true,
        aiProblemConfig: true,
      },
    });

    return success(res, { message: "Team updated.", team });
  } catch (err) {
    console.error("Update team error:", err);
    return error(res, "Failed to update team.", 500);
  }
}

// ============================================================================
// GET TEAM DETAILS WITH MEMBERS (SUPER_ADMIN — any team)
// ============================================================================
export async function getTeamDetails(req, res) {
  try {
    const { teamId } = req.params;

    const team = await prisma.team.findUnique({
      where: { id: teamId },
      select: {
        id: true,
        name: true,
        description: true,
        avatarUrl: true,
        status: true,
        joinCode: true,
        isPersonal: true,
        maxMembers: true,
        aiProblemsEnabled: true,
        createdById: true,
        createdAt: true,
        approvedAt: true,
        rejectionReason: true,
        createdBy: { select: { id: true, name: true, email: true } },
        _count: {
          select: { currentMembers: true, problems: true, solutions: true },
        },
      },
    });

    if (!team) {
      return error(res, "Team not found.", 404);
    }

    const members = await prisma.user.findMany({
      where: { currentTeamId: teamId },
      select: {
        id: true,
        name: true,
        email: true,
        avatarUrl: true,
        teamRole: true,
        streak: true,
        lastActiveAt: true,
        activityStatus: true,
        createdAt: true,
        _count: { select: { solutions: true } },
      },
      orderBy: [{ teamRole: "asc" }, { lastActiveAt: "desc" }],
    });

    return success(res, {
      team,
      members: members.map((m) => ({
        ...m,
        solutionCount: m._count.solutions,
        _count: undefined,
      })),
    });
  } catch (err) {
    console.error("Get team details error:", err);
    return error(res, "Failed to fetch team details.", 500);
  }
}

// ============================================================================
// DELETE TEAM (SUPER_ADMIN)
// ============================================================================
export async function deleteTeam(req, res) {
  try {
    const { teamId } = req.params;

    const team = await prisma.team.findUnique({
      where: { id: teamId },
      select: {
        id: true,
        name: true,
        isPersonal: true,
        _count: {
          select: { currentMembers: true, problems: true, solutions: true },
        },
      },
    });

    if (!team) {
      return error(res, "Team not found.", 404);
    }
    if (team.isPersonal) {
      return error(
        res,
        "Cannot delete a personal space. Delete the user instead.",
        400,
      );
    }

    const members = await prisma.user.findMany({
      where: { currentTeamId: teamId },
      select: { id: true, personalTeamId: true },
    });

    await prisma.$transaction(async (tx) => {
      // Switch all members to their personal spaces
      for (const member of members) {
        await tx.user.update({
          where: { id: member.id },
          data: {
            currentTeamId: member.personalTeamId || null,
            teamRole: member.personalTeamId ? "TEAM_ADMIN" : null,
          },
        });
      }

      // TeamMembership records are cascade-deleted when team is deleted
      // (TeamMembership has onDelete: Cascade on Team FK)
      await tx.team.delete({ where: { id: teamId } });
    });

    return success(res, {
      message: `Team "${team.name}" deleted. ${members.length} member(s) moved to individual mode. ${team._count.problems} problems and ${team._count.solutions} solutions archived.`,
    });
  } catch (err) {
    console.error("Delete team error:", err);
    return error(res, "Failed to delete team.", 500);
  }
}
