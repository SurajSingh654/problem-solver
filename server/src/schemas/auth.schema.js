// ============================================================================
// ProbSolver v3.0 — Auth Validation Schemas
// ============================================================================
//
// DESIGN DECISIONS:
//
// 1. Shared schemas: Exported individually so controllers import only
//    what they need. Each schema validates exactly one operation.
//
// 2. Password rules: Minimum 8 chars, at least one uppercase, one
//    lowercase, one digit. Not overly strict (no special char requirement)
//    because research shows length matters more than complexity.
//
// 3. Error messages: Custom messages for every rule so the frontend
//    can display specific, user-friendly validation errors without
//    parsing Zod's internal format.
//
// 4. Onboarding schema: Validates the choice between 'team' and
//    'individual' mode. If 'team', optionally accepts a joinCode
//    to immediately join an existing team.
//
// ============================================================================

// `.strict()` everywhere so unknown keys produce a 400 instead of being
// silently stripped by validate() middleware — audit M34 hardening
// (Sprint 8a). See CLAUDE.md's "five touch points" for the recurring
// silent-strip regression class this guards against.

import { z } from "zod";

// ── Reusable field schemas ───────────────────────────────────

const emailField = z
  .string({ required_error: "Email is required." })
  .email("Please enter a valid email address.")
  .max(255, "Email must be under 255 characters.")
  .transform((v) => v.toLowerCase().trim());

const passwordField = z
  .string({ required_error: "Password is required." })
  .min(8, "Password must be at least 8 characters.")
  .max(128, "Password must be under 128 characters.")
  .regex(/[a-z]/, "Password must contain at least one lowercase letter.")
  .regex(/[A-Z]/, "Password must contain at least one uppercase letter.")
  .regex(/[0-9]/, "Password must contain at least one number.");

const nameField = z
  .string({ required_error: "Name is required." })
  .min(2, "Name must be at least 2 characters.")
  .max(100, "Name must be under 100 characters.")
  .transform((v) => v.trim());

const verificationCodeField = z
  .string({ required_error: "Verification code is required." })
  .length(6, "Code must be exactly 6 digits.")
  .regex(/^\d{6}$/, "Code must be exactly 6 digits.");

// ── Registration ─────────────────────────────────────────────

export const registerSchema = z.object({
  email: emailField,
  password: passwordField,
  name: nameField,
}).strict();

// ── Login ────────────────────────────────────────────────────

export const loginSchema = z.object({
  email: emailField,
  password: z
    .string({ required_error: "Password is required." })
    .min(1, "Password is required."),
}).strict();

// ── Email verification ───────────────────────────────────────

export const verifyEmailSchema = z.object({
  email: emailField,
  code: verificationCodeField,
}).strict();

export const resendVerificationSchema = z.object({
  email: emailField,
}).strict();

// ── Password reset ───────────────────────────────────────────

export const forgotPasswordSchema = z.object({
  email: emailField,
}).strict();

export const resetPasswordSchema = z.object({
  email: emailField,
  code: verificationCodeField,
  newPassword: passwordField,
}).strict();

// ── Change password (logged in) ──────────────────────────────

export const changePasswordSchema = z.object({
  currentPassword: z
    .string({ required_error: "Current password is required." })
    .min(1),
  newPassword: passwordField,
}).strict();

// ── Email change ─────────────────────────────────────────────

export const requestEmailChangeSchema = z.object({
  newEmail: emailField,
  password: z
    .string({ required_error: "Password is required for email changes." })
    .min(1),
}).strict();

export const confirmEmailChangeSchema = z.object({
  code: verificationCodeField,
}).strict();

// Pre-verification email update — user can't log in yet, so no password gate.
// Both fields use emailField (z.string().email().max(255).transform(lowercase+trim)).
export const updateUnverifiedEmailSchema = z.object({
  currentEmail: emailField,
  newEmail: emailField,
}).strict();

// Team context switch — requires only the target teamId. Both the
// existence check and membership check live in the controller.
export const switchTeamSchema = z.object({
  teamId: z
    .string({ required_error: "Team ID is required." })
    .min(1, "Team ID is required."),
}).strict();

// ── Onboarding (post-registration team/individual choice) ────

export const onboardingSchema = z
  .object({
    mode: z.enum(["team", "individual"], {
      required_error: "Please choose team or individual mode.",
      invalid_type_error: 'Mode must be "team" or "individual".',
    }),

    // If mode is 'team' and user wants to join an existing team
    joinCode: z
      .string()
      .min(6, "Join code must be at least 6 characters.")
      .max(12, "Join code must be under 12 characters.")
      .transform((v) => v.toUpperCase().trim())
      .optional(),

    // If mode is 'team' and user wants to create a new team
    teamName: z
      .string()
      .min(2, "Team name must be at least 2 characters.")
      .max(100, "Team name must be under 100 characters.")
      .transform((v) => v.trim())
      .optional(),

    teamDescription: z
      .string()
      .max(500, "Description must be under 500 characters.")
      .transform((v) => v.trim())
      .optional(),
  })
  .strict()
  .refine(
    (data) => {
      // If mode is 'team', must provide either joinCode or teamName
      if (data.mode === "team") {
        return !!(data.joinCode || data.teamName);
      }
      return true;
    },
    {
      message:
        "Please provide a join code to join a team or a name to create one.",
      path: ["joinCode"],
    },
  );

// ── Profile update ───────────────────────────────────────────

// ── Profile update ───────────────────────────────────────────
export const updateProfileSchema = z.object({
  name: nameField.optional(),
  targetCompany: z
    .string()
    .max(100)
    .transform((v) => v.trim())
    .optional()
    .nullable(),
  interviewDate: z.string().datetime().optional().nullable(),
  preferredLanguage: z.string().max(50).optional().nullable(),
  avatarUrl: z
    .string()
    .max(500, "Avatar value must be under 500 characters.")
    .refine(
      (v) => /^#[0-9a-fA-F]{6}$/.test(v) || /^https?:\/\/.+/.test(v),
      "Avatar must be a hex color (e.g. #7c6ff7) or a valid URL.",
    )
    .optional()
    .nullable(),
  aiProblemConfig: z
    .object({
      categories: z
        .array(
          z.enum([
            "CODING",
            "SYSTEM_DESIGN",
            "BEHAVIORAL",
            "CS_FUNDAMENTALS",
            "HR",
            "SQL",
          ]),
        )
        .optional(),
      difficulty: z.enum(["EASY", "MEDIUM", "HARD"]).optional(),
      dailyCount: z.number().int().min(1).max(10).optional(),
      targetCompanyStyle: z.string().max(50).optional(),
      patterns: z.array(z.string()).optional(),
    })
    .optional()
    .nullable(),
}).strict();
