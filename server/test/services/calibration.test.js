// ============================================================================
// Calibration service — pure-function unit tests.
// ============================================================================
//
// Goldens:
//   - all correct → score = total, every concept TRUE
//   - all wrong   → score = 0, every concept FALSE
//   - mixed       → per-concept correctness is AND across that concept's questions
//
// Validation:
//   - missing responses → MISSING_RESPONSES with details.missing[]
//   - unknown ids       → UNKNOWN_QUESTION_IDS with details.unknown[]
//   - bad answer key    → INVALID_ANSWER
//   - unknown topic slug → BANK_NOT_FOUND
//
// Wire-safe shape regression:
//   - getCalibrationForTopic must NOT leak `correct` or `rationale`.
// ============================================================================

import { describe, it, expect } from "vitest";
import {
  getCalibrationForTopic,
  scoreCalibration,
  CalibrationError,
} from "../../src/services/calibration.service.js";
import bank from "../../src/services/calibration/aiEngineering.questions.js";

describe("getCalibrationForTopic", () => {
  it("returns the full bank for ai-engineering", () => {
    const out = getCalibrationForTopic("ai-engineering");
    expect(out.questions.length).toBe(bank.length);
    expect(out.questions[0].id).toBe("ae-1");
  });

  it("strips `correct` and `rationale` from every question (wire-safe)", () => {
    const out = getCalibrationForTopic("ai-engineering");
    for (const q of out.questions) {
      expect(q).not.toHaveProperty("correct");
      expect(q).not.toHaveProperty("rationale");
      // Choices must keep key + text but nothing else identifies the answer.
      for (const c of q.choices) {
        expect(Object.keys(c).sort()).toEqual(["key", "text"]);
      }
    }
  });

  it("throws BANK_NOT_FOUND for an unknown topic slug", () => {
    expect(() => getCalibrationForTopic("nonexistent-topic")).toThrowError(
      CalibrationError,
    );
    try {
      getCalibrationForTopic("nonexistent-topic");
    } catch (err) {
      expect(err.code).toBe("BANK_NOT_FOUND");
    }
  });
});

// Helpers for building responses against the real bank.
function allCorrect() {
  return bank.map((q) => ({ questionId: q.id, answer: q.correct }));
}
function allWrong() {
  return bank.map((q) => {
    const wrong = q.choices.find((c) => c.key !== q.correct);
    return { questionId: q.id, answer: wrong.key };
  });
}

describe("scoreCalibration — goldens", () => {
  it("all correct → score === total, every concept TRUE", () => {
    const result = scoreCalibration("ai-engineering", allCorrect());
    expect(result.score).toBe(bank.length);
    expect(result.total).toBe(bank.length);
    for (const concept of Object.keys(result.perConceptCorrectness)) {
      expect(result.perConceptCorrectness[concept]).toBe(true);
    }
    // Rationales released only after submit (this fn is the post-submit path).
    for (const q of bank) {
      expect(result.rationales[q.id]).toBe(q.rationale);
    }
  });

  it("all wrong → score === 0, every concept FALSE", () => {
    const result = scoreCalibration("ai-engineering", allWrong());
    expect(result.score).toBe(0);
    expect(result.total).toBe(bank.length);
    for (const concept of Object.keys(result.perConceptCorrectness)) {
      expect(result.perConceptCorrectness[concept]).toBe(false);
    }
  });

  it("multi-question concept: ONE wrong → concept marked FALSE (strict AND)", () => {
    // ae-1 and ae-2 both belong to llm-fundamentals. Get ae-1 right, ae-2 wrong.
    const responses = allCorrect();
    const ae2 = responses.find((r) => r.questionId === "ae-2");
    const ae2Question = bank.find((q) => q.id === "ae-2");
    ae2.answer = ae2Question.choices.find((c) => c.key !== ae2Question.correct).key;

    const result = scoreCalibration("ai-engineering", responses);
    expect(result.perQuestionCorrectness["ae-1"]).toBe(true);
    expect(result.perQuestionCorrectness["ae-2"]).toBe(false);
    expect(result.perConceptCorrectness["llm-fundamentals"]).toBe(false);
    // Other concepts (single-question) still all true.
    expect(result.perConceptCorrectness["embeddings"]).toBe(true);
    expect(result.score).toBe(bank.length - 1);
  });
});

describe("scoreCalibration — validation", () => {
  it("MISSING_RESPONSES when bank coverage is incomplete", () => {
    const partial = allCorrect().slice(0, 3);
    try {
      scoreCalibration("ai-engineering", partial);
      throw new Error("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(CalibrationError);
      expect(err.code).toBe("MISSING_RESPONSES");
      expect(err.details.missing.length).toBe(bank.length - 3);
    }
  });

  it("UNKNOWN_QUESTION_IDS when client invents an id", () => {
    const responses = allCorrect();
    responses[0].questionId = "ae-bogus";
    try {
      scoreCalibration("ai-engineering", responses);
      throw new Error("should have thrown");
    } catch (err) {
      // Coverage check fires first because removing ae-1 from the submitted
      // set creates a missing-id, which is the higher-priority validation.
      // Either error is acceptable; the controller maps both to 400.
      expect(err).toBeInstanceOf(CalibrationError);
      expect(["MISSING_RESPONSES", "UNKNOWN_QUESTION_IDS"]).toContain(err.code);
    }
  });

  it("UNKNOWN_QUESTION_IDS when an EXTRA invented id is appended", () => {
    const responses = [...allCorrect(), { questionId: "ae-extra", answer: "A" }];
    try {
      scoreCalibration("ai-engineering", responses);
      throw new Error("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(CalibrationError);
      expect(err.code).toBe("UNKNOWN_QUESTION_IDS");
      expect(err.details.unknown).toEqual(["ae-extra"]);
    }
  });

  it("INVALID_ANSWER when answer key is not one of the choices", () => {
    const responses = allCorrect();
    responses[0].answer = "Z"; // not a valid choice
    try {
      scoreCalibration("ai-engineering", responses);
      throw new Error("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(CalibrationError);
      expect(err.code).toBe("INVALID_ANSWER");
      expect(err.details.questionId).toBe("ae-1");
    }
  });

  it("INVALID_RESPONSES when responses is not an array", () => {
    expect(() => scoreCalibration("ai-engineering", null)).toThrow(
      CalibrationError,
    );
    expect(() =>
      scoreCalibration("ai-engineering", { foo: "bar" }),
    ).toThrowError(/responses must be an array/);
  });

  it("BANK_NOT_FOUND for unknown topic", () => {
    try {
      scoreCalibration("ghost-topic", []);
      throw new Error("should have thrown");
    } catch (err) {
      expect(err.code).toBe("BANK_NOT_FOUND");
    }
  });
});
