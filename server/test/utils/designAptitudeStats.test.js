// ============================================================================
// designAptitudeStats — D8 unit tests
// ============================================================================
import { describe, it, expect } from "vitest";
import {
  computeDesignAptitudeStats,
  classifySourceQuality,
  ceilingForSourceQuality,
  DRAFT_ONLY_CEILING,
  SCENARIO_TESTED_CEILING,
  INTERVIEWER_PAIRED_CEILING,
  SCENARIO_TESTED_MIN_SCENARIOS,
  PHASE_MIN_CHARS,
  SCENARIO_VERDICT_TO_SCORE,
} from "../../src/utils/designAptitudeStats.js";

// ── Tiny fixture builders ────────────────────────────────────────────

const SD_DIM_KEYS = [
  "requirementsCompleteness",
  "estimationSoundness",
  "apiDesignQuality",
  "dataModelCorrectness",
  "architectureCoherence",
  "deepDiveDepth",
  "tradeoffAwareness",
  "scenarioResilience",
  "scaleReadiness",
  "communicationClarity",
];

function uniformDims(value) {
  const out = {};
  for (const k of SD_DIM_KEYS) out[k] = value;
  return out;
}

function evaluation({ overallScore = 7, dims = uniformDims(7) } = {}) {
  return { overallScore, dimensions: dims };
}

function phasesFilled(filledCount, totalCount = 7) {
  const out = {};
  const filler = "x".repeat(PHASE_MIN_CHARS);
  for (let i = 0; i < totalCount; i++) {
    out[`phase${i}`] = i < filledCount ? filler : "";
  }
  return out;
}

function scenario(verdict) {
  return { status: "evaluated", aiVerdict: { verdict } };
}

function session({
  designType = "SYSTEM_DESIGN",
  mode = "SELF_PACED",
  evaluation: ev = evaluation(),
  phases = phasesFilled(7),
  scenarios = [],
  interviewSessions = [],
} = {}) {
  return {
    id: `ds-${Math.random().toString(36).slice(2, 8)}`,
    designType,
    mode,
    evaluation: ev,
    phases,
    scenarios,
    interviewSessions,
  };
}

// ── Source-tier tier classification ──────────────────────────────────

describe("classifySourceQuality", () => {
  it("returns 'draft-only' when no scenarios and no interviewer-paired sessions", () => {
    expect(classifySourceQuality({
      sessionCount: 3, evaluatedScenarioCount: 0, interviewerPairedCount: 0,
    })).toBe("draft-only");
  });

  it("returns 'scenario-tested' at ≥3 scenarios, no interview pairing", () => {
    expect(classifySourceQuality({
      sessionCount: 1, evaluatedScenarioCount: 3, interviewerPairedCount: 0,
    })).toBe("scenario-tested");
    expect(classifySourceQuality({
      sessionCount: 5, evaluatedScenarioCount: 10, interviewerPairedCount: 0,
    })).toBe("scenario-tested");
  });

  it("returns 'interviewer-paired' when ≥1 interview-paired session (regardless of scenarios)", () => {
    expect(classifySourceQuality({
      sessionCount: 1, evaluatedScenarioCount: 0, interviewerPairedCount: 1,
    })).toBe("interviewer-paired");
    expect(classifySourceQuality({
      sessionCount: 5, evaluatedScenarioCount: 15, interviewerPairedCount: 2,
    })).toBe("interviewer-paired");
  });
});

describe("ceilingForSourceQuality", () => {
  it("maps each tier to its ceiling", () => {
    expect(ceilingForSourceQuality("draft-only")).toBe(DRAFT_ONLY_CEILING);
    expect(ceilingForSourceQuality("scenario-tested")).toBe(SCENARIO_TESTED_CEILING);
    expect(ceilingForSourceQuality("interviewer-paired")).toBe(INTERVIEWER_PAIRED_CEILING);
  });

  it("ceilings are monotonically increasing", () => {
    expect(DRAFT_ONLY_CEILING).toBeLessThan(SCENARIO_TESTED_CEILING);
    expect(SCENARIO_TESTED_CEILING).toBeLessThan(INTERVIEWER_PAIRED_CEILING);
  });
});

// ── Activation ──────────────────────────────────────────────────────

describe("computeDesignAptitudeStats — activation", () => {
  it("inactive when no sessions", () => {
    const r = computeDesignAptitudeStats({ sessions: [] });
    expect(r.active).toBe(false);
    expect(r.score).toBeNull();
    expect(r.ci).toBeNull();
  });

  it("inactive when sessions have no evaluation", () => {
    const r = computeDesignAptitudeStats({
      sessions: [
        { ...session(), evaluation: null },
        { ...session(), evaluation: null },
      ],
    });
    expect(r.active).toBe(false);
    expect(r.score).toBeNull();
  });

  it("active at ≥1 session with non-null evaluation", () => {
    const r = computeDesignAptitudeStats({
      sessions: [session({ evaluation: evaluation({ overallScore: 6 }) })],
    });
    expect(r.active).toBe(true);
    expect(r.score).not.toBeNull();
    expect(r.sourceQuality).toBe("draft-only");
    expect(r.ceiling).toBe(DRAFT_ONLY_CEILING);
  });
});

// ── Source-tier ceiling enforcement ─────────────────────────────────

describe("computeDesignAptitudeStats — source-tier ceiling", () => {
  it("draft-only tier caps score at DRAFT_ONLY_CEILING (30)", () => {
    // High-quality session but no scenarios — ceiling 30 caps the score.
    const r = computeDesignAptitudeStats({
      sessions: [
        session({
          evaluation: evaluation({ overallScore: 10, dims: uniformDims(10) }),
          phases: phasesFilled(7),
          scenarios: [],
        }),
      ],
    });
    expect(r.sourceQuality).toBe("draft-only");
    expect(r.score).toBeLessThanOrEqual(DRAFT_ONLY_CEILING);
  });

  it("scenario-tested tier allows score up to SCENARIO_TESTED_CEILING (70)", () => {
    const r = computeDesignAptitudeStats({
      sessions: [
        session({
          evaluation: evaluation({ overallScore: 9, dims: uniformDims(9) }),
          scenarios: [scenario("PASS"), scenario("PASS"), scenario("PASS")],
        }),
      ],
    });
    expect(r.sourceQuality).toBe("scenario-tested");
    expect(r.score).toBeLessThanOrEqual(SCENARIO_TESTED_CEILING);
    expect(r.score).toBeGreaterThan(DRAFT_ONLY_CEILING);
  });

  it("interviewer-paired tier allows score up to 100", () => {
    const r = computeDesignAptitudeStats({
      sessions: [
        session({
          mode: "INTERVIEW",
          evaluation: evaluation({ overallScore: 9, dims: uniformDims(9) }),
          scenarios: [scenario("PASS"), scenario("PASS"), scenario("PASS")],
          interviewSessions: [{ status: "COMPLETED", debrief: { verdict: "HIRE" } }],
        }),
      ],
    });
    expect(r.sourceQuality).toBe("interviewer-paired");
    expect(r.score).toBeLessThanOrEqual(INTERVIEWER_PAIRED_CEILING);
    expect(r.score).toBeGreaterThan(SCENARIO_TESTED_CEILING);
  });

  it("INTERVIEW-mode session WITHOUT debrief does NOT promote to interviewer-paired", () => {
    const r = computeDesignAptitudeStats({
      sessions: [
        session({
          mode: "INTERVIEW",
          scenarios: [scenario("PASS"), scenario("PASS"), scenario("PASS")],
          interviewSessions: [{ status: "ACTIVE", debrief: null }],
        }),
      ],
    });
    expect(r.sourceQuality).toBe("scenario-tested");
    expect(r.interviewerPairedCount).toBe(0);
  });

  it("score sits inside CI band (asymmetric clamp pattern)", () => {
    // Mixed-quality sessions — variance is real.
    const r = computeDesignAptitudeStats({
      sessions: [
        session({ evaluation: evaluation({ overallScore: 8 }) }),
        session({ evaluation: evaluation({ overallScore: 4 }) }),
        session({ evaluation: evaluation({ overallScore: 6 }) }),
      ],
    });
    expect(r.active).toBe(true);
    expect(r.score).toBeGreaterThanOrEqual(r.ci[0]);
    expect(r.score).toBeLessThanOrEqual(r.ci[1]);
    expect(r.ci[1]).toBeLessThanOrEqual(r.ceiling);
  });
});

// ── Sub-component effects ──────────────────────────────────────────

describe("computeDesignAptitudeStats — scenario resilience", () => {
  it("FAIL-heavy scenarios hurt the score relative to PASS-heavy", () => {
    const allPass = computeDesignAptitudeStats({
      sessions: [
        session({
          scenarios: [scenario("PASS"), scenario("PASS"), scenario("PASS")],
        }),
      ],
    });
    const allFail = computeDesignAptitudeStats({
      sessions: [
        session({
          scenarios: [scenario("FAIL"), scenario("FAIL"), scenario("FAIL")],
        }),
      ],
    });
    expect(allFail.score).toBeLessThan(allPass.score);
    expect(allFail.scenarioPassRate).toBe(0);
    expect(allPass.scenarioPassRate).toBe(1);
  });

  it("PARTIAL scenarios produce mid-band resilience score", () => {
    const allPartial = computeDesignAptitudeStats({
      sessions: [
        session({
          scenarios: [scenario("PARTIAL"), scenario("PARTIAL"), scenario("PARTIAL")],
        }),
      ],
    });
    expect(allPartial.scenarioPassRate).toBe(0); // PARTIAL doesn't count as PASS
    // PARTIAL → 50, which feeds the resilience sub-component.
    expect(allPartial.score).toBeGreaterThan(0);
  });
});

describe("computeDesignAptitudeStats — dimension breadth", () => {
  it("uniform dimension scores produce high breadth (low std-dev)", () => {
    const r = computeDesignAptitudeStats({
      sessions: [
        session({ evaluation: evaluation({ dims: uniformDims(7) }) }),
      ],
    });
    expect(r.avgDimensionBreadth).toBe(100); // stddev = 0 → breadth = 100
  });

  it("lopsided dimension scores produce lower breadth", () => {
    const lopsidedDims = {};
    for (const k of SD_DIM_KEYS) lopsidedDims[k] = 3;
    lopsidedDims.requirementsCompleteness = 10; // one peak
    lopsidedDims.architectureCoherence = 10; // another peak
    const r = computeDesignAptitudeStats({
      sessions: [session({ evaluation: evaluation({ dims: lopsidedDims }) })],
    });
    expect(r.avgDimensionBreadth).toBeLessThan(100);
  });
});

describe("computeDesignAptitudeStats — phase completeness", () => {
  it("partially-filled phases produce <100 completeness", () => {
    const r = computeDesignAptitudeStats({
      sessions: [
        session({
          phases: phasesFilled(3, 7), // 3 of 7 filled
        }),
      ],
    });
    expect(r.avgPhaseCompleteness).toBeCloseTo((3 / 7) * 100, 0);
  });

  it("phases under PHASE_MIN_CHARS don't count as filled", () => {
    const r = computeDesignAptitudeStats({
      sessions: [
        session({
          phases: {
            requirements: "short", // < 50 chars — doesn't count
            apiDesign: "x".repeat(PHASE_MIN_CHARS), // counts
          },
        }),
      ],
    });
    expect(r.avgPhaseCompleteness).toBe(50); // 1 of 2 filled
  });
});

// ── Combined-modality coverage (SD + LLD) ──────────────────────────

describe("computeDesignAptitudeStats — modality split tracking", () => {
  it("tracks SD and LLD session counts separately", () => {
    const r = computeDesignAptitudeStats({
      sessions: [
        session({ designType: "SYSTEM_DESIGN" }),
        session({ designType: "SYSTEM_DESIGN" }),
        session({ designType: "LOW_LEVEL_DESIGN" }),
      ],
    });
    expect(r.sdSessionCount).toBe(2);
    expect(r.lldSessionCount).toBe(1);
    expect(r.sessionCount).toBe(3);
  });

  it("LLD-only sessions still produce a valid score", () => {
    const r = computeDesignAptitudeStats({
      sessions: [
        session({
          designType: "LOW_LEVEL_DESIGN",
          evaluation: evaluation({ overallScore: 7, dims: uniformDims(7) }),
        }),
      ],
    });
    expect(r.active).toBe(true);
    expect(r.lldSessionCount).toBe(1);
    expect(r.sdSessionCount).toBe(0);
    expect(r.score).toBeGreaterThan(0);
  });
});

// ── Constants ────────────────────────────────────────────────────────

describe("designAptitudeStats constants", () => {
  it("scenario verdict scores are sane", () => {
    expect(SCENARIO_VERDICT_TO_SCORE.PASS).toBe(100);
    expect(SCENARIO_VERDICT_TO_SCORE.PARTIAL).toBe(50);
    expect(SCENARIO_VERDICT_TO_SCORE.FAIL).toBe(0);
  });

  it("source-tier scenario floor is reasonable", () => {
    expect(SCENARIO_TESTED_MIN_SCENARIOS).toBe(3);
  });

  it("phase content threshold is at least 50 chars", () => {
    expect(PHASE_MIN_CHARS).toBeGreaterThanOrEqual(50);
  });
});
