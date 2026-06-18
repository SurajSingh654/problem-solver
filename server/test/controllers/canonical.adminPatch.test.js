import { describe, it, expect, beforeEach, vi } from "vitest";
import { invoke, makeReq } from "./_harness.js";

let problemRow = { id: "prob_1", canonicalEditedAt: null, canonicalEditedByUserId: null };
let updateCall = null;

vi.mock("../../src/lib/prisma.js", () => ({
  default: {
    problem: {
      findFirst: vi.fn(async ({ where }) =>
        where.id === "prob_1" ? problemRow : null,
      ),
      update: vi.fn(async ({ where, data }) => {
        updateCall = { where, data };
        problemRow = { ...problemRow, ...data };
        return problemRow;
      }),
    },
  },
}));

const { patchCanonical } = await import(
  "../../src/controllers/problems.controller.js"
);

describe("patchCanonical (admin)", () => {
  beforeEach(() => {
    problemRow = { id: "prob_1", canonicalEditedAt: null, canonicalEditedByUserId: null };
    updateCall = null;
  });

  it("SUPER_ADMIN can update canonical fields", async () => {
    const req = makeReq({
      params: { id: "prob_1" },
      body: { canonicalPattern: "Array / Hashing", canonicalKeyInsight: "use a map" },
      user: { id: "u_admin", globalRole: "SUPER_ADMIN" },
    });
    const { status } = await invoke(patchCanonical, req);
    expect(status).toBe(200);
    expect(updateCall.data.canonicalPattern).toBe("Array / Hashing");
    expect(updateCall.data.canonicalEditedByUserId).toBe("u_admin");
    expect(updateCall.data.canonicalEditedAt).toBeInstanceOf(Date);
  });

  it("regular user gets 403", async () => {
    const req = makeReq({
      params: { id: "prob_1" },
      body: { canonicalPattern: "Array / Hashing" },
      user: { id: "u_member", globalRole: "USER" },
    });
    const { status } = await invoke(patchCanonical, req);
    expect(status).toBe(403);
  });

  it("rejects pattern outside the canonical taxonomy", async () => {
    const req = makeReq({
      params: { id: "prob_1" },
      body: { canonicalPattern: "Made-Up Pattern" },
      user: { id: "u_admin", globalRole: "SUPER_ADMIN" },
    });
    const { status } = await invoke(patchCanonical, req);
    expect(status).toBe(400);
  });

  it("returns 404 for missing problem", async () => {
    const req = makeReq({
      params: { id: "missing" },
      body: { canonicalPattern: "Array / Hashing" },
      user: { id: "u_admin", globalRole: "SUPER_ADMIN" },
    });
    const { status } = await invoke(patchCanonical, req);
    expect(status).toBe(404);
  });
});
