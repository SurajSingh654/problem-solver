import { z } from "zod";

export const generateQuizSchema = z.object({
  body: z.object({
    subject: z.string().min(1).max(200),
    difficulty: z.enum(["EASY", "MEDIUM", "HARD"]).default("MEDIUM"),
    count: z.number().int().min(3).max(25).default(10),
    context: z.string().max(500).optional(),
  }),
});
