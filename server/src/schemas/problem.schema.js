import { z } from "zod";

const followUpSchema = z.object({
  question: z.string().min(5),
  difficulty: z.enum(["EASY", "MEDIUM", "HARD"]),
  hint: z.string().optional(),
  order: z.number().int().optional(),
});

export const createProblemSchema = z.object({
  body: z.object({
    title: z.string().min(2).max(200),
    source: z.enum([
      "LEETCODE",
      "GFG",
      "CODECHEF",
      "INTERVIEWBIT",
      "HACKERRANK",
      "CODEFORCES",
      "OTHER",
    ]),
    sourceUrl: z.string().url("Invalid URL"),
    difficulty: z.enum(["EASY", "MEDIUM", "HARD"]),
    category: z
      .enum([
        "CODING",
        "SYSTEM_DESIGN",
        "BEHAVIORAL",
        "CS_FUNDAMENTALS",
        "HR",
        "SQL",
      ])
      .default("CODING"),
    tags: z.array(z.string()).default([]),
    companyTags: z.array(z.string()).default([]),
    isPinned: z.boolean().default(false),
    isBlindChallenge: z.boolean().default(false),
    blindRevealAt: z.string().datetime().optional().nullable(),
    realWorldContext: z.string().optional(),
    useCases: z.array(z.string()).default([]),
    adminNotes: z.string().optional(),
    relatedProblems: z.array(z.string()).default([]),
    followUps: z.array(followUpSchema).default([]),
    description: z.string().optional(),
    categoryData: z.string().optional(), // JSON string
  }),
});

export const updateProblemSchema = z.object({
  body: createProblemSchema.shape.body.partial(),
  params: z.object({ id: z.string() }),
});

export const problemParamsSchema = z.object({
  params: z.object({ id: z.string() }),
});

export const problemQuerySchema = z.object({
  query: z
    .object({
      difficulty: z.enum(["EASY", "MEDIUM", "HARD"]).optional(),
      category: z
        .enum([
          "CODING",
          "SYSTEM_DESIGN",
          "BEHAVIORAL",
          "CS_FUNDAMENTALS",
          "HR",
          "SQL",
        ])
        .optional(),
      source: z.string().optional(),
      tag: z.string().optional(),
      company: z.string().optional(),
      search: z.string().optional(),
      pinned: z.string().optional(),
      page: z.string().optional(),
      limit: z.string().optional(),
    })
    .optional(),
});
