// ============================================================================
// ProbSolver — Note Folders Controller
// ============================================================================
//
// User-scoped hierarchical folders for personal notes. Every endpoint
// MUST filter by `req.user.id` — there is no team scoping, no admin
// override.
//
// - GET    /notes/folders         list (flat) — client builds the tree
// - POST   /notes/folders         create  { name, parentId? }
// - PATCH  /notes/folders/:id     rename or reparent
// - DELETE /notes/folders/:id     cascade subfolders; notes detach to Uncategorized
//
// Reparent rejects cycles by walking the proposed parent's chain
// upward — if the folder being moved appears in that chain, the
// operation is illegal.
// ============================================================================

import prisma from "../lib/prisma.js";
import { success, error } from "../utils/response.js";

const NAME_MIN = 1;
const NAME_MAX = 80;

function trimName(raw) {
  if (typeof raw !== "string") return "";
  // Strip ASCII control chars (0x00–0x1F and 0x7F) without a regex,
  // then collapse remaining whitespace.
  let cleaned = "";
  for (const ch of raw) {
    const code = ch.charCodeAt(0);
    if (code < 0x20 || code === 0x7f) continue;
    cleaned += ch;
  }
  return cleaned.replace(/\s+/g, " ").trim().slice(0, NAME_MAX);
}

function dtoFolder(f) {
  return {
    id: f.id,
    name: f.name,
    parentId: f.parentId,
    noteCount: f._count?.notes ?? undefined,
    createdAt: f.createdAt,
    updatedAt: f.updatedAt,
  };
}

// Walk parent chain upward; return true if `ancestorId` appears in the
// chain rooted at `startId`. Used to reject cycles on reparent.
async function isDescendantOf(startId, ancestorId, userId) {
  let current = startId;
  // Defensive cap — folder trees should be shallow; if we hit 100 levels
  // something is structurally wrong.
  for (let i = 0; i < 100; i++) {
    if (current == null) return false;
    if (current === ancestorId) return true;
    const row = await prisma.noteFolder.findFirst({
      where: { id: current, userId },
      select: { parentId: true },
    });
    if (!row) return false;
    current = row.parentId;
  }
  return true; // assume cycle to be safe
}

// ── LIST ────────────────────────────────────────────────────────────
export async function listFolders(req, res) {
  try {
    const userId = req.user.id;
    const folders = await prisma.noteFolder.findMany({
      where: { userId },
      orderBy: [{ parentId: "asc" }, { name: "asc" }],
      include: { _count: { select: { notes: true } } },
    });
    return success(res, { folders: folders.map(dtoFolder) });
  } catch (err) {
    console.error("listFolders:", err);
    return error(res, "Failed to list folders", 500);
  }
}

// ── CREATE ──────────────────────────────────────────────────────────
export async function createFolder(req, res) {
  try {
    const userId = req.user.id;
    const name = trimName(req.body?.name);
    if (name.length < NAME_MIN) return error(res, "Folder name is required", 400);

    let parentId = null;
    if (req.body?.parentId) {
      if (typeof req.body.parentId !== "string") {
        return error(res, "Invalid parentId", 400);
      }
      const parent = await prisma.noteFolder.findFirst({
        where: { id: req.body.parentId, userId },
        select: { id: true },
      });
      if (!parent) return error(res, "Parent folder not found", 404);
      parentId = parent.id;
    }

    try {
      const folder = await prisma.noteFolder.create({
        data: { userId, parentId, name },
        include: { _count: { select: { notes: true } } },
      });
      return success(res, { folder: dtoFolder(folder) }, 201);
    } catch (e) {
      // Unique constraint on (userId, parentId, name).
      if (e.code === "P2002") {
        return error(res, "A folder with this name already exists here", 409);
      }
      throw e;
    }
  } catch (err) {
    console.error("createFolder:", err);
    return error(res, "Failed to create folder", 500);
  }
}

// ── RENAME / REPARENT ───────────────────────────────────────────────
export async function updateFolder(req, res) {
  try {
    const userId = req.user.id;
    const existing = await prisma.noteFolder.findFirst({
      where: { id: req.params.id, userId },
      select: { id: true, parentId: true },
    });
    if (!existing) return error(res, "Folder not found", 404);

    const data = {};

    if (typeof req.body?.name === "string") {
      const name = trimName(req.body.name);
      if (name.length < NAME_MIN) return error(res, "Folder name cannot be empty", 400);
      data.name = name;
    }

    if ("parentId" in (req.body || {})) {
      const raw = req.body.parentId;
      if (raw === null || raw === "" || raw === undefined) {
        data.parentId = null;
      } else if (typeof raw === "string") {
        if (raw === existing.id) {
          return error(res, "A folder cannot be its own parent", 400);
        }
        const parent = await prisma.noteFolder.findFirst({
          where: { id: raw, userId },
          select: { id: true },
        });
        if (!parent) return error(res, "Parent folder not found", 404);
        // Cycle check: the proposed parent must not be a descendant
        // of `existing.id`.
        const wouldCycle = await isDescendantOf(raw, existing.id, userId);
        if (wouldCycle) {
          return error(res, "Cannot move a folder into its own descendant", 400);
        }
        data.parentId = raw;
      } else {
        return error(res, "Invalid parentId", 400);
      }
    }

    if (Object.keys(data).length === 0) {
      return error(res, "No changes provided", 400);
    }

    try {
      const folder = await prisma.noteFolder.update({
        where: { id: existing.id },
        data,
        include: { _count: { select: { notes: true } } },
      });
      return success(res, { folder: dtoFolder(folder) });
    } catch (e) {
      if (e.code === "P2002") {
        return error(res, "A folder with this name already exists here", 409);
      }
      throw e;
    }
  } catch (err) {
    console.error("updateFolder:", err);
    return error(res, "Failed to update folder", 500);
  }
}

// ── DELETE ──────────────────────────────────────────────────────────
//
// Cascades to subfolders (FK ON DELETE CASCADE on note_folders.parentId).
// Notes inside cascade-detach: notes.folderId is ON DELETE SET NULL, so
// they survive and become Uncategorized.
export async function deleteFolder(req, res) {
  try {
    const userId = req.user.id;
    const existing = await prisma.noteFolder.findFirst({
      where: { id: req.params.id, userId },
      select: { id: true },
    });
    if (!existing) return error(res, "Folder not found", 404);
    await prisma.noteFolder.delete({ where: { id: existing.id } });
    return success(res, { deleted: true });
  } catch (err) {
    console.error("deleteFolder:", err);
    return error(res, "Failed to delete folder", 500);
  }
}
