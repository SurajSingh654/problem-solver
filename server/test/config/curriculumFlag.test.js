import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

describe("FEATURE_CURRICULUM startup dependency check", () => {
  let originalEnv;
  beforeEach(() => {
    originalEnv = { ...process.env };
    vi.resetModules();
    // env.js `required()` calls process.exit(1) at import time if these
    // are missing; ensure they exist (dotenv would normally set them, but
    // afterEach restores process.env to whatever state it was in before
    // dotenv loaded, so we set them explicitly here).
    process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://test:test@localhost:5432/test";
    process.env.JWT_SECRET = process.env.JWT_SECRET || "test-jwt-secret-not-a-real-key";
  });
  afterEach(() => {
    process.env = originalEnv;
    vi.resetModules();
  });

  it("passes when FEATURE_CURRICULUM=false regardless of dependencies", async () => {
    process.env.FEATURE_CURRICULUM = "false";
    process.env.FEATURE_TEACHING_SESSIONS = "false";
    process.env.FEATURE_NOTES_ENABLED = "false";
    const { assertCurriculumDependencies } = await import("../../src/config/env.js");
    expect(() => assertCurriculumDependencies()).not.toThrow();
  });

  it("passes when FEATURE_CURRICULUM=true AND both dependencies=true", async () => {
    process.env.FEATURE_CURRICULUM = "true";
    process.env.FEATURE_TEACHING_SESSIONS = "true";
    process.env.FEATURE_NOTES_ENABLED = "true";
    const { assertCurriculumDependencies } = await import("../../src/config/env.js");
    expect(() => assertCurriculumDependencies()).not.toThrow();
  });

  it("throws when FEATURE_CURRICULUM=true but FEATURE_TEACHING_SESSIONS=false", async () => {
    process.env.FEATURE_CURRICULUM = "true";
    process.env.FEATURE_TEACHING_SESSIONS = "false";
    process.env.FEATURE_NOTES_ENABLED = "true";
    const { assertCurriculumDependencies } = await import("../../src/config/env.js");
    expect(() => assertCurriculumDependencies()).toThrow(/FEATURE_TEACHING_SESSIONS/);
  });

  it("throws when FEATURE_CURRICULUM=true but FEATURE_NOTES_ENABLED=false", async () => {
    process.env.FEATURE_CURRICULUM = "true";
    process.env.FEATURE_TEACHING_SESSIONS = "true";
    process.env.FEATURE_NOTES_ENABLED = "false";
    const { assertCurriculumDependencies } = await import("../../src/config/env.js");
    expect(() => assertCurriculumDependencies()).toThrow(/FEATURE_NOTES_ENABLED/);
  });
});
