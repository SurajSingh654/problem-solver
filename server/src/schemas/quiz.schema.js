// `.strict()` everywhere so unknown keys produce a 400 instead of being
// silently stripped by validate() middleware — audit M34 hardening
// (Sprint 8a). See CLAUDE.md's "five touch points" for the recurring
// silent-strip regression class this guards against.

import { z } from "zod";

export const generateQuizSchema = z.object({
  body: z.object({
    subject: z.string().min(1).max(200),
    difficulty: z.enum(["EASY", "MEDIUM", "HARD"]).default("MEDIUM"),
    count: z.number().int().min(3).max(25).default(10),
    context: z.string().max(500).optional(),
  }),
}).strict();
