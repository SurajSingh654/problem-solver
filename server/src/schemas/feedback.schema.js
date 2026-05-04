/**
 * FEEDBACK SCHEMAS — Zod validation for feedback report endpoints.
 */
import { z } from "zod";

export const createFeedbackSchema = z.object({
  type: z.enum(["BUG", "SUGGESTION", "QUESTION"]).default("BUG"),

  title: z
    .string()
    .min(5, "Title must be at least 5 characters")
    .max(150, "Title must be under 150 characters"),

  description: z
    .string()
    .min(10, "Please provide more detail — at least 10 characters")
    .max(5000, "Description too long — keep it under 5000 characters"),

  severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).default("MEDIUM"),

  affectedArea: z.string().max(100).optional().nullable(),

  stepsToReproduce: z.string().max(2000).optional().nullable(),
});

export const updateFeedbackStatusSchema = z.object({
  status: z.enum([
    "OPEN",
    "ACKNOWLEDGED",
    "IN_PROGRESS",
    "RESOLVED",
    "WONT_FIX",
  ]),
  adminNote: z.string().max(1000).optional().nullable(),
});
