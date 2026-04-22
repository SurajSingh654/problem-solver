// ============================================================================
// ProbSolver v3.0 — Team Validation Schemas
// ============================================================================
//
// DESIGN DECISIONS:
//
// 1. Team name uniqueness: Not enforced at schema level (enforced in
//    controller with a DB check). Two different organizations might
//    want teams named "Engineering" — that's valid.
//
// 2. Join code format: Uppercase alphanumeric, 8 characters. Generated
//    server-side, not user-provided. The schema here validates the
//    code format when a user submits one to join.
//
// 3. Invitation email: Validated as an email array for bulk invites.
//    Max 10 per request to prevent abuse.
//
// 4. AI config: Validated as a flexible JSON object. The structure
//    is loose intentionally — AI config evolves frequently and we
//    don't want schema changes for every new config field.
//
// ============================================================================

import { z } from 'zod'

// ── Create team ──────────────────────────────────────────────

export const createTeamSchema = z.object({
  name: z
    .string({ required_error: 'Team name is required.' })
    .min(2, 'Team name must be at least 2 characters.')
    .max(100, 'Team name must be under 100 characters.')
    .transform((v) => v.trim()),

  description: z
    .string()
    .max(500, 'Description must be under 500 characters.')
    .transform((v) => v.trim())
    .optional(),

  maxMembers: z
    .number()
    .int('Max members must be a whole number.')
    .min(2, 'Team must allow at least 2 members.')
    .max(100, 'Team cannot exceed 100 members.')
    .optional(),
})

// ── Update team (TEAM_ADMIN) ─────────────────────────────────

export const updateTeamSchema = z.object({
  name: z
    .string()
    .min(2, 'Team name must be at least 2 characters.')
    .max(100, 'Team name must be under 100 characters.')
    .transform((v) => v.trim())
    .optional(),

  description: z
    .string()
    .max(500, 'Description must be under 500 characters.')
    .transform((v) => v.trim())
    .optional()
    .nullable(),

  avatarUrl: z.string().url().max(500).optional().nullable(),

  maxMembers: z
    .number()
    .int()
    .min(2)
    .max(100)
    .optional(),

  aiProblemsEnabled: z.boolean().optional(),

  aiProblemConfig: z.object({
    categories: z.array(z.string()).optional(),
    difficultyDistribution: z.record(z.number()).optional(),
    frequency: z.enum(['daily', 'weekly', 'manual']).optional(),
    autoPublish: z.boolean().optional(),
    targetCompanyStyle: z.string().max(50).optional(),
    problemsPerBatch: z.number().int().min(1).max(10).optional(),
  }).optional().nullable(),
})

// ── Join team by code ────────────────────────────────────────

export const joinTeamSchema = z.object({
  joinCode: z
    .string({ required_error: 'Join code is required.' })
    .min(6, 'Join code must be at least 6 characters.')
    .max(12, 'Join code must be under 12 characters.')
    .transform((v) => v.toUpperCase().trim()),
})

// ── Invite members (TEAM_ADMIN) ──────────────────────────────

export const inviteMembersSchema = z.object({
  emails: z
    .array(
      z.string().email('Each entry must be a valid email address.'),
      { required_error: 'At least one email is required.' }
    )
    .min(1, 'At least one email is required.')
    .max(10, 'Cannot invite more than 10 people at once.')
    .transform((arr) => arr.map((e) => e.toLowerCase().trim())),
})

// ── Approve/reject team (SUPER_ADMIN) ────────────────────────

export const approveTeamSchema = z.object({
  action: z.enum(['approve', 'reject'], {
    required_error: 'Action is required (approve or reject).',
  }),

  rejectionReason: z
    .string()
    .max(500, 'Reason must be under 500 characters.')
    .transform((v) => v.trim())
    .optional(),
}).refine(
  (data) => {
    if (data.action === 'reject') {
      return !!data.rejectionReason && data.rejectionReason.length > 0
    }
    return true
  },
  {
    message: 'A reason is required when rejecting a team.',
    path: ['rejectionReason'],
  }
)

// ── Promote/demote member (TEAM_ADMIN) ───────────────────────

export const changeMemberRoleSchema = z.object({
  role: z.enum(['TEAM_ADMIN', 'MEMBER'], {
    required_error: 'Role is required.',
    invalid_type_error: 'Role must be TEAM_ADMIN or MEMBER.',
  }),
})

// ── Transfer ownership ───────────────────────────────────────

export const transferOwnershipSchema = z.object({
  newOwnerId: z
    .string({ required_error: 'New owner ID is required.' })
    .min(1, 'New owner ID is required.'),
})