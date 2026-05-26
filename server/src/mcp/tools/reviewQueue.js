// ============================================================================
// MCP tool — get_review_queue
// ============================================================================
//
// Returns the user's overdue (and optionally upcoming) SM-2 spaced-repetition
// review queue. Daily-driver query — answers "what should I review right now?".
//
// PRIVACY/SECURITY:
//   - Direct Prisma query with userId + teamId filter from getMcpContext()
//   - Solution titles + patterns surfaced (already publicly-named content)
//   - User-authored content (notes, code) NOT exposed — caller can fetch full
//     solution via separate web UI; MCP just surfaces the queue
//   - Limit clamped to 1..20 (DoS / context-budget defense)
// ============================================================================

import { z } from "zod";
import { getMcpContext } from "../context.js";
import prisma from "../../lib/prisma.js";

const inputSchema = z
  .object({
    /**
     * How many items to return. Default 5, max 20. Below 5 risks missing
     * the day's actual queue; above 20 burns LLM context with little benefit.
     */
    limit: z.number().int().min(1).max(20).optional(),
    /**
     * include_upcoming=true → also returns items due in the next 48h
     * (helps the LLM say "you have 3 today + 2 tomorrow"). Default false.
     */
    include_upcoming: z.boolean().optional(),
  })
  .strict();

const queueRowSchema = z.object({
  problem_title: z.string(),
  problem_difficulty: z.enum(["EASY", "MEDIUM", "HARD"]).nullable(),
  patterns: z.array(z.string()),
  next_review_date: z.string(), // ISO
  days_overdue: z.number(), // negative when "upcoming"
  sm2_repetitions: z.number(),
  sm2_easiness_factor: z.number().nullable(),
  status: z.enum(["overdue", "due-today", "upcoming"]),
});

async function handler(args) {
  const { userId, teamId } = getMcpContext();
  if (!teamId) {
    return {
      content: [
        {
          type: "text",
          text: "No active team context. Switch to a team in the web UI before querying the review queue.",
        },
      ],
      isError: true,
    };
  }

  const limit = args?.limit ?? 5;
  const includeUpcoming = args?.include_upcoming === true;
  const now = new Date();
  const upcomingCutoff = new Date(now.getTime() + 48 * 60 * 60 * 1000);

  const cutoff = includeUpcoming ? upcomingCutoff : now;

  const rows = await prisma.solution.findMany({
    where: {
      userId,
      teamId,
      nextReviewDate: { lte: cutoff },
    },
    orderBy: { nextReviewDate: "asc" },
    take: limit,
    select: {
      id: true,
      patterns: true,
      nextReviewDate: true,
      sm2Repetitions: true,
      sm2EasinessFactor: true,
      problem: {
        select: {
          title: true,
          difficulty: true,
        },
      },
    },
  });

  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000);

  const out = rows.map((r) => {
    const review = r.nextReviewDate;
    const msDiff = (review?.getTime() ?? 0) - now.getTime();
    const daysOverdue = -Math.round(msDiff / (24 * 60 * 60 * 1000));

    let status;
    if (review && review < startOfToday) status = "overdue";
    else if (review && review < endOfToday) status = "due-today";
    else status = "upcoming";

    return queueRowSchema.parse({
      problem_title: r.problem?.title ?? "(untitled problem)",
      problem_difficulty: r.problem?.difficulty ?? null,
      patterns: Array.isArray(r.patterns) ? r.patterns : [],
      next_review_date: review ? review.toISOString() : new Date().toISOString(),
      days_overdue: daysOverdue,
      sm2_repetitions: r.sm2Repetitions ?? 0,
      sm2_easiness_factor:
        typeof r.sm2EasinessFactor === "number" ? r.sm2EasinessFactor : null,
      status,
    });
  });

  // Total overdue count across the whole queue (not just the limited slice)
  // — useful for "you have 7 overdue" framing without dumping all 7 rows.
  const totalOverdue = await prisma.solution.count({
    where: {
      userId,
      teamId,
      nextReviewDate: { lt: startOfToday },
    },
  });

  const summary = {
    total_overdue: totalOverdue,
    showing: out.length,
    items: out,
  };

  return {
    content: [{ type: "text", text: JSON.stringify(summary, null, 2) }],
  };
}

export function register(server) {
  server.registerTool(
    "get_review_queue",
    {
      title: "Get spaced-repetition review queue",
      description:
        "Get the user's SM-2 spaced-repetition queue — solutions that are overdue (or due soon, " +
        "if include_upcoming=true). Use this to answer 'what should I review today?' or 'how " +
        "many overdue items do I have?'. " +
        "Returns a summary { total_overdue, showing, items: [...] }. Each item carries: " +
        "problem_title, difficulty, patterns, next_review_date, days_overdue (negative = upcoming), " +
        "sm2_repetitions, sm2_easiness_factor, status (overdue|due-today|upcoming). " +
        "Defaults: limit=5, include_upcoming=false. Limit clamped 1..20.",
      inputSchema: inputSchema.shape,
    },
    handler,
  );
}
