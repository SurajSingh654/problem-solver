// ============================================================================
// Topic calibration controller — wire-level integration tests.
// ============================================================================
//
// Targets three regression risks:
//   1. GET 404 when the user isn't enrolled (security + correctness).
//   2. GET MUST NOT leak `correct` / `rationale` to the wire — the bank file
//      contains answers and the result-screen rationales; either reaching
//      an unauthenticated network response would defeat the calibration.
//   3. POST scores correctly and writes the JSON to TopicEnrollment.calibration
//      with the documented shape (the "field reaches the DB column" wire test).
// ============================================================================

import { describe, it, expect, beforeEach, vi } from "vitest";
import { invoke, makeReq } from "./_harness.js";
import bank from "../../src/services/calibration/aiEngineering.questions.js";

let updateCalls = [];

vi.mock("../../src/lib/prisma.js", () => ({
  default: {
    topic: {
      // Post 2026-07-04 tenancy migration, topics.controller uses findFirst
      // ({slug, teamId, status}) because Topic.slug is @@unique([teamId, slug]).
      findFirst: vi.fn(async ({ where }) =>
        where.slug === "ai-engineering" ? { id: "topic_ae", teamId: where.teamId } : null,
      ),
    },
    topicEnrollment: {
      findUnique: vi.fn(async ({ where }) => {
        // Convention used in tests:
        //   user_enrolled — has enrollment, no calibration yet
        //   user_calibrated — has enrollment + previous calibration
        //   user_unenrolled — no enrollment row
        const userId = where?.userId_topicId?.userId;
        if (userId === "user_enrolled") {
          return { id: "enr_1", calibration: null, status: "ACTIVE" };
        }
        if (userId === "user_calibrated") {
          return {
            id: "enr_2",
            calibration: { score: 5, total: 8, takenAt: "2026-05-01" },
            status: "ACTIVE",
          };
        }
        return null;
      }),
      update: vi.fn(async ({ where, data }) => {
        updateCalls.push({ where, data });
        return { id: where.id, ...data };
      }),
    },
  },
}));

// Mentor service is invoked after submit to recompute next-action; mock it
// so we don't need the full mentor graph wired up for these tests.
vi.mock("../../src/services/mentor.service.js", () => ({
  planNextAction: vi.fn(async () => ({
    stage: "INTAKE",
    concept: { slug: "llm-fundamentals", name: "LLM fundamentals" },
    surface: { route: "/learn/ai-engineering", params: {} },
    minutes: 20,
    reason: "Calibration complete — start with LLM fundamentals.",
  })),
  detectStuck: vi.fn(async () => ({ stuck: false, signals: [] })),
}));

import {
  getTopicCalibration,
  submitTopicCalibration,
} from "../../src/controllers/topics.controller.js";

beforeEach(() => {
  updateCalls = [];
});

describe("getTopicCalibration", () => {
  it("returns 404 when user is not enrolled", async () => {
    const res = await invoke(
      getTopicCalibration,
      makeReq({
        params: { slug: "ai-engineering" },
        user: { id: "user_unenrolled", globalRole: "USER" },
      }),
    );
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error.message).toMatch(/enroll/i);
  });

  it("returns wire-safe questions: NO `correct`, NO `rationale` in payload", async () => {
    const res = await invoke(
      getTopicCalibration,
      makeReq({
        params: { slug: "ai-engineering" },
        user: { id: "user_enrolled", globalRole: "USER" },
      }),
    );
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.questions.length).toBe(bank.length);
    for (const q of res.body.data.questions) {
      expect(q).not.toHaveProperty("correct");
      expect(q).not.toHaveProperty("rationale");
    }
    expect(res.body.data.existing).toBeNull();
  });

  it("returns existing calibration when user has one", async () => {
    const res = await invoke(
      getTopicCalibration,
      makeReq({
        params: { slug: "ai-engineering" },
        user: { id: "user_calibrated", globalRole: "USER" },
      }),
    );
    expect(res.status).toBe(200);
    expect(res.body.data.existing).toEqual({
      score: 5,
      total: 8,
      takenAt: "2026-05-01",
    });
  });

  it("returns 404 when topic slug is unknown", async () => {
    const res = await invoke(
      getTopicCalibration,
      makeReq({
        params: { slug: "no-such-topic" },
        user: { id: "user_enrolled", globalRole: "USER" },
      }),
    );
    expect(res.status).toBe(404);
  });
});

describe("submitTopicCalibration", () => {
  function allCorrectResponses() {
    return bank.map((q) => ({ questionId: q.id, answer: q.correct }));
  }

  it("scores + persists calibration JSON in the documented shape", async () => {
    const res = await invoke(
      submitTopicCalibration,
      makeReq({
        params: { slug: "ai-engineering" },
        user: { id: "user_enrolled", globalRole: "USER" },
        body: { responses: allCorrectResponses() },
      }),
    );
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.score).toBe(bank.length);
    expect(res.body.data.total).toBe(bank.length);
    expect(res.body.data.perConceptCorrectness).toBeTypeOf("object");
    expect(res.body.data.rationales).toBeTypeOf("object");
    // After submit, rationales ARE released (intentional — feedback screen).
    expect(Object.keys(res.body.data.rationales).length).toBe(bank.length);

    // The wire→DB path: assert the exact shape persisted to TopicEnrollment.calibration.
    expect(updateCalls.length).toBe(1);
    const persisted = updateCalls[0].data.calibration;
    expect(persisted.score).toBe(bank.length);
    expect(persisted.total).toBe(bank.length);
    expect(persisted.perConceptCorrectness).toBeTypeOf("object");
    expect(persisted.perQuestionCorrectness).toBeTypeOf("object");
    expect(typeof persisted.takenAt).toBe("string");
    // Rationales must NOT be persisted to the DB — they live in source.
    expect(persisted).not.toHaveProperty("rationales");
  });

  it("returns the recomputed nextAction so the result screen can deep-link", async () => {
    const res = await invoke(
      submitTopicCalibration,
      makeReq({
        params: { slug: "ai-engineering" },
        user: { id: "user_enrolled", globalRole: "USER" },
        body: { responses: allCorrectResponses() },
      }),
    );
    expect(res.status).toBe(200);
    expect(res.body.data.nextAction.stage).toBe("INTAKE");
    expect(res.body.data.nextAction.concept.slug).toBe("llm-fundamentals");
  });

  it("returns 400 with structured details on partial coverage", async () => {
    const res = await invoke(
      submitTopicCalibration,
      makeReq({
        params: { slug: "ai-engineering" },
        user: { id: "user_enrolled", globalRole: "USER" },
        body: { responses: allCorrectResponses().slice(0, 3) },
      }),
    );
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("MISSING_RESPONSES");
    expect(res.body.error.details.missing.length).toBeGreaterThan(0);
    // Persistence must NOT happen on validation failure.
    expect(updateCalls.length).toBe(0);
  });

  it("returns 404 when user is not enrolled (no DB write)", async () => {
    const res = await invoke(
      submitTopicCalibration,
      makeReq({
        params: { slug: "ai-engineering" },
        user: { id: "user_unenrolled", globalRole: "USER" },
        body: { responses: allCorrectResponses() },
      }),
    );
    expect(res.status).toBe(404);
    expect(updateCalls.length).toBe(0);
  });
});
