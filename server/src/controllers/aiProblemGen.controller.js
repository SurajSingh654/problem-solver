// ============================================================================
// AI Problem Generation Controller
// ============================================================================
//
// Owns:
//   generateProblemContent  — single-problem content generator (TEAM_ADMIN)
//   findSimilarProblems     — team-scoped vector similarity search
//   generateProblemsAI      — multi-stage batch problem generation pipeline
//
// All three were migrated from ai.controller.js (Sprint 2 Task 9).
// aiErrorResponse comes from the shared util introduced in the same task.
//
// ============================================================================
import prisma from "../lib/prisma.js";
import { success, error } from "../utils/response.js";
import { AI_ENABLED, AI_MODEL_PRIMARY, AI_MODEL_FAST } from "../config/env.js";
import { aiComplete, AIError } from "../services/ai.service.js";
import {
  validateProblemSelection,
  validateProblemContent,
} from "../services/ai.validators.js";
import {
  buildFallbackProblemContent,
} from "../services/ai.fallbacks.js";
import { resolveGeneratedSourceUrl } from "../utils/platformSearch.js";
import {
  findSimilarTitles,
  normalizeProblemTitle,
} from "../utils/titleSimilarity.js";
import { CANONICAL_SOURCE_LISTS } from "../utils/sourceListTaxonomy.js";
import { aiErrorResponse } from "../utils/aiErrorResponse.js";

// ============================================================================
// AI PROBLEM CONTENT GENERATOR (TEAM_ADMIN tool)
// ============================================================================
export async function generateProblemContent(req, res) {
  try {
    if (!AI_ENABLED) {
      return error(res, "AI features are not enabled.", 503);
    }

    const { title, category, difficulty } = req.body;

    const contentTokenBudget = {
      SYSTEM_DESIGN: 3500,
      LOW_LEVEL_DESIGN: 2800,
      CODING: 2000,
      BEHAVIORAL: 1800,
      CS_FUNDAMENTALS: 2000,
      SQL: 1800,
      HR: 1500,
    };
    const contentModelMap = {
      SYSTEM_DESIGN: AI_MODEL_PRIMARY,
      LOW_LEVEL_DESIGN: AI_MODEL_PRIMARY,
    };

    let content;
    let usedContentFallback = false;
    let contentViolations = [];
    try {
      content = await aiComplete({
        systemPrompt: `You are an expert interview problem designer. Generate complete problem content.
Return JSON:
{
  "description": "Full problem description with examples",
  "realWorldContext": "Real-world application of this problem",
  "useCases": "3-5 use cases as a string",
  "adminNotes": "Teaching notes: expected approach, edge cases, key insight, common mistakes",
  "tags": ["tag1", "tag2", ...],
  "followUpQuestions": [
    { "question": "...", "difficulty": "EASY", "hint": "..." },
    { "question": "...", "difficulty": "MEDIUM", "hint": "..." },
    { "question": "...", "difficulty": "HARD", "hint": "..." }
  ]
}`,
        userPrompt: `Generate content for: "${title}"\nCategory: ${category || "CODING"}\nDifficulty: ${difficulty || "MEDIUM"}`,
        userId: req.user.id,
        teamId: req.teamId,
        model: contentModelMap[category] || AI_MODEL_FAST,
        temperature: 0.8,
        maxTokens: contentTokenBudget[category] || 2000,
        jsonMode: true,
        surface: "problem-content",
      });
      const check = validateProblemContent(content, { category });
      if (!check.valid) {
        contentViolations = check.violations;
        console.warn(
          `[problem-content] validation failed: ${contentViolations.join(", ")}`,
        );
        content = buildFallbackProblemContent({ title, category });
        usedContentFallback = true;
      }
    } catch (aiErr) {
      if (aiErr instanceof AIError && aiErr.code === "RATE_LIMITED") {
        return aiErrorResponse(res, aiErr, "Failed to generate problem content.");
      }
      console.warn(
        `[problem-content] AI call failed (${aiErr?.code || aiErr?.message}); using fallback`,
      );
      content = buildFallbackProblemContent({ title, category });
      usedContentFallback = true;
      contentViolations = [`llm-error:${aiErr?.code || aiErr?.message || "unknown"}`];
    }

    return success(res, {
      content,
      usedFallback: usedContentFallback,
      ...(usedContentFallback ? { fallbackReason: contentViolations } : {}),
    });
  } catch (err) {
    console.error("Generate content error:", err);
    return error(res, "Failed to generate problem content.", 500);
  }
}

// ============================================================================
// SIMILAR PROBLEMS SEARCH (Team-Scoped Vector Search)
// ============================================================================
export async function findSimilarProblems(req, res) {
  try {
    if (!AI_ENABLED) {
      return error(res, "AI features are not enabled.", 503);
    }

    const { query } = req.body;
    const teamId = req.teamId;

    const { generateEmbedding } =
      await import("../services/embedding.service.js");
    const embedding = await generateEmbedding(query);

    if (!embedding) {
      return error(res, "Failed to generate search embedding.", 500);
    }

    const vectorStr = `[${embedding.join(",")}]`;

    const similar = await prisma.$queryRawUnsafe(
      `
  SELECT
    p.id,
    p.title,
    p.difficulty,
    p.category,
    p.tags,
    1 - (p.embedding <=> $1::vector) as similarity
  FROM problems p
  WHERE p."teamId" = $2
    AND p."isPublished" = true
    AND p."isHidden" = false
    AND p.embedding IS NOT NULL
  ORDER BY p.embedding <=> $1::vector
  LIMIT 5
`,
      vectorStr,
      teamId,
    );

    return success(res, { problems: similar });
  } catch (err) {
    console.error("Similar problems error:", err);
    return error(res, "Failed to search similar problems.", 500);
  }
}

// ============================================================================
// AI PROBLEM GENERATION (Multi-Stage Pipeline — for Team Admin)
// ============================================================================
//
// ARCHITECTURE:
// Stage 1 — Intelligence: Gather team performance data from DB (parallel queries)
// Stage 2 — Selection: AI decides WHAT problems to generate (fast, cheap call)
// Stage 3 — Content: Generate rich content per problem IN PARALLEL
//
// Platform assignment: done in CODE before Stage 2, not left to AI.
// Currently LeetCode-only for reliable URLs.
// TODO: Replace with Search API for multi-platform support.
// See Super Admin → Product Roadmap for details.
//
// ============================================================================
export async function generateProblemsAI(req, res) {
  try {
    if (!AI_ENABLED) {
      return error(res, "AI features are not enabled.", 503);
    }

    const teamId = req.teamId;
    const userId = req.user.id;
    const {
      category,
      count,
      difficulty,
      targetCompany,
      focusAreas,
      sourceList,
      urls,
    } = req.body;

    if (!category) {
      return error(res, "Category is required.", 400);
    }

    // sourceList (optional) constrains the AI to a canonical curriculum sheet.
    // Stricter than the manual create form: AI can only reliably recall the
    // four canonical sheets, so custom labels are rejected here even though
    // the underlying column accepts them.
    let curriculum = null;
    if (sourceList !== undefined && sourceList !== null && sourceList !== "") {
      if (typeof sourceList !== "string") {
        return error(res, "sourceList must be a string.", 400);
      }
      const match = CANONICAL_SOURCE_LISTS.find(
        (s) => s.toLowerCase() === sourceList.trim().toLowerCase(),
      );
      if (!match) {
        return error(
          res,
          `Custom curriculum labels aren't supported in the generator yet — leave blank or pick from: ${CANONICAL_SOURCE_LISTS.join(", ")}.`,
          400,
        );
      }
      curriculum = match;
    }

    // urls (optional) flips the generator into URL recall mode. Each URL must
    // parse via the URL constructor and use http(s). Cap at 5 to match the
    // existing per-batch ceiling.
    let problemUrls = null;
    if (urls !== undefined && urls !== null && urls !== "") {
      if (!Array.isArray(urls)) {
        return error(res, "urls must be an array of strings.", 400);
      }
      if (urls.length === 0) {
        // Empty array — treat as not-set
      } else if (urls.length > 5) {
        return error(res, "urls accepts at most 5 entries.", 400);
      } else {
        const parsed = [];
        for (const raw of urls) {
          if (typeof raw !== "string" || raw.trim() === "") {
            return error(res, "urls must be non-empty strings.", 400);
          }
          try {
            const u = new URL(raw.trim());
            if (u.protocol !== "http:" && u.protocol !== "https:") {
              return error(res, `Invalid URL protocol: ${raw}`, 400);
            }
            parsed.push(raw.trim());
          } catch {
            return error(res, `Malformed URL: ${raw}`, 400);
          }
        }
        problemUrls = parsed;
      }
    }
    const urlMode = problemUrls !== null;

    // URL mode forces count = urls.length and difficulty = "auto" (AI infers
    // per URL from recall). Form controls are visually locked client-side;
    // server enforces it regardless to keep the prompt coherent.
    const problemCount = urlMode
      ? problemUrls.length
      : Math.min(Math.max(parseInt(count) || 1, 1), 5);
    const difficultyPref = urlMode ? "auto" : difficulty || "auto";

    // ── STAGE 1: Intelligence Gathering ────────────────
    // All DB queries run in parallel for speed.
    let teamContext = "";
    let existingProblems = "";
    let difficultyInstruction = "";

    try {
      const [existing, totalMembers, solutionStats, patternGaps] =
        await Promise.all([
          // Existing problems to avoid duplicates
          prisma.problem.findMany({
            where: { teamId, category, isPublished: true },
            select: { title: true, difficulty: true },
            take: 50,
          }),
          // Team size for context
          prisma.user.count({ where: { currentTeamId: teamId } }),
          // Performance by difficulty in this category
          prisma.$queryRaw`
            SELECT
              p.difficulty,
              COUNT(DISTINCT s."userId")::int as solvers,
              ROUND(AVG(s.confidence), 1)::float as avg_confidence,
              COUNT(s.id)::int as total_solutions
            FROM solutions s
            JOIN problems p ON s."problemId" = p.id
            WHERE s."teamId" = ${teamId}
              AND p.category = ${category}::"ProblemCategory"
            GROUP BY p.difficulty
          `,
          // This user's patterns to find gaps (intentionally userId-scoped,
          // not team-scoped — we want to know what THIS user has practiced)
          prisma.solution.findMany({
            where: { teamId, userId },
            select: { patterns: true, confidence: true },
            orderBy: { createdAt: "desc" },
            take: 30,
          }),
        ]);

      // Build existing problems list for deduplication
      if (existing.length > 0) {
        existingProblems = existing
          .map((p) => `- ${p.title} (${p.difficulty})`)
          .join("\n");
      }

      // Build rich team context string
      if (solutionStats.length > 0) {
        teamContext = `Team size: ${totalMembers} members\n`;
        teamContext += `Experience in ${category}:\n`;
        solutionStats.forEach((s) => {
          const level =
            s.avg_confidence >= 4
              ? "Strong"
              : s.avg_confidence >= 3
                ? "Developing"
                : "Struggling";
          teamContext += `  ${s.difficulty}: ${s.solvers}/${totalMembers} members solved, avg confidence ${s.avg_confidence}/5 (${level})\n`;
        });

        const practicedPatterns = [
          ...new Set(patternGaps.flatMap((s) => s.patterns ?? [])),
        ];
        if (practicedPatterns.length > 0) {
          teamContext += `Patterns already practiced: ${practicedPatterns.join(", ")}\n`;
        }

        const weakPatterns = [
          ...new Set(
            patternGaps
              .filter((s) => s.confidence <= 2 && s.patterns?.length > 0)
              .flatMap((s) => s.patterns),
          ),
        ];
        if (weakPatterns.length > 0) {
          teamContext += `Weak areas needing reinforcement: ${weakPatterns.join(", ")}\n`;
        }
      } else {
        teamContext = `Team size: ${totalMembers} members. Fresh start in ${category} — no solutions yet. Begin with fundamentals.`;
      }

      // Compute difficulty instruction from actual team performance
      if (difficultyPref === "auto") {
        const hasEasy = solutionStats.find((s) => s.difficulty === "EASY");
        const hasMedium = solutionStats.find((s) => s.difficulty === "MEDIUM");

        if (!hasEasy || hasEasy.avg_confidence < 3) {
          difficultyInstruction = `Team needs foundational work. Generate ${Math.ceil(problemCount * 0.6)} EASY and ${Math.floor(problemCount * 0.4)} MEDIUM problems.`;
        } else if (!hasMedium || hasMedium.avg_confidence < 3) {
          difficultyInstruction = `Team has basic skills. Generate ${Math.ceil(problemCount * 0.3)} EASY, ${Math.ceil(problemCount * 0.5)} MEDIUM, and ${Math.floor(problemCount * 0.2)} HARD problems.`;
        } else {
          difficultyInstruction = `Team is progressing well. Generate ${Math.ceil(problemCount * 0.2)} EASY, ${Math.ceil(problemCount * 0.4)} MEDIUM, and ${Math.floor(problemCount * 0.4)} HARD problems.`;
        }
      } else if (difficultyPref.startsWith("custom:")) {
        const parts = difficultyPref.replace("custom:", "").split(",");
        const easy = parseInt(parts[0]) || 0;
        const medium = parseInt(parts[1]) || 0;
        const hard = parseInt(parts[2]) || 0;
        difficultyInstruction = `Generate exactly: ${easy} EASY, ${medium} MEDIUM, ${hard} HARD problems.`;
      } else {
        difficultyInstruction = `All ${problemCount} problems should be ${difficultyPref} difficulty.`;
      }
    } catch (err) {
      console.error("Stage 1 intelligence gathering failed:", err.message);
      // Non-fatal — continue with defaults
      teamContext = "Context unavailable — generate balanced problems.";
      difficultyInstruction =
        difficultyPref === "auto"
          ? "Mix of EASY, MEDIUM, and HARD."
          : difficultyPref.startsWith("custom:")
            ? difficultyInstruction || "Mix of difficulties."
            : `${difficultyPref} difficulty.`;
    }

    // ── STAGE 2: Problem Selection ──────────────────────
    // Platform assignments computed HERE in code — not left to AI.
    // This guarantees reliable URLs (LeetCode-only for now).
    // TODO: Replace with Search API for multi-platform support.
    // See Super Admin → Product Roadmap for details.
    const { problemSelectionPrompt, problemContentGenerationPrompt } =
      await import("../services/ai.prompts.js");

    const platformAssignments = Array.from(
      { length: problemCount },
      (_, i) => ({
        platform:
          category === "CODING" || category === "SQL" ? "LEETCODE" : "OTHER",
        slot: i + 1,
        difficulty: (() => {
          if (!difficultyPref.startsWith("custom:")) {
            return difficultyPref === "auto" ? "auto" : difficultyPref;
          }
          const parts = difficultyPref.replace("custom:", "").split(",");
          const easy = parseInt(parts[0]) || 0;
          const medium = parseInt(parts[1]) || 0;
          if (i < easy) return "EASY";
          if (i < easy + medium) return "MEDIUM";
          return "HARD";
        })(),
      }),
    );

    const selectionPromptData = {
      category,
      count: problemCount,
      difficulty: difficultyPref,
      difficultyInstruction,
      teamContext,
      existingProblems,
      targetCompany,
      focusAreas,
      sourceList: curriculum,
      urls: problemUrls,
      platformAssignments,
    };

    const { system: selSystem, user: selUser } =
      problemSelectionPrompt(selectionPromptData);

    let selections = [];
    let learningPath = "";
    let unrecognizedUrls = [];

    try {
      const selectionResult = await aiComplete({
        systemPrompt: selSystem,
        userPrompt: selUser,
        userId: req.user.id,
        teamId: req.teamId,
        model: AI_MODEL_FAST,
        temperature: 0.7,
        maxTokens: 1200,
        jsonMode: true,
        surface: "problem-selection",
      });

      // Validate the AI's selection against hard rules: array length,
      // urlConfidence enum, well-formed URLs, HR category required for HR.
      // In URL mode, the count check is relaxed: selections (high-conf) +
      // unrecognizedUrls must equal the requested count, and learningPath
      // is optional. Any violation → throw to trigger the legacy single-call
      // fallback (non-URL mode only).
      const selectionCheck = validateProblemSelection(selectionResult, {
        count: problemCount,
        category,
        urlMode,
      });
      if (!selectionCheck.valid) {
        console.warn(
          `[problem-selection] validation failed: ${selectionCheck.violations.join(", ")}`,
        );
        throw new Error(
          `selection-validation-failed:${selectionCheck.violations.join(",")}`,
        );
      }

      selections = selectionResult.selections || [];
      learningPath = selectionResult.learningPath || "";
      if (urlMode && Array.isArray(selectionResult.unrecognizedUrls)) {
        unrecognizedUrls = selectionResult.unrecognizedUrls;
      }

      // Enforce platform assignments — AI sometimes substitutes platforms.
      // platformAssignments was sized for `problemCount` (URL count), but in
      // URL mode the AI may have returned fewer selections — index by
      // selection position, not slot, since the legacy slot semantics
      // (E/M/H ordering) don't apply when URLs drive selection.
      // Also normalize title casing here — single point of repair so every
      // downstream consumer (Stage 3 content generation, similarTo lookup,
      // response payload, fallback paths) sees the corrected title.
      selections = selections.map((sel, i) => ({
        ...sel,
        title: normalizeProblemTitle(sel.title),
        platform: platformAssignments[i]?.platform || sel.platform,
      }));
    } catch (err) {
      console.error("Stage 2 selection failed:", err.message);

      // In URL mode, the legacy single-call generator can't recall specific
      // URLs — falling back would silently substitute generic problems and
      // confuse the admin. Surface the failure instead.
      if (urlMode) {
        return aiErrorResponse(
          res,
          err,
          "AI failed to recall the requested URLs. Try fewer URLs or paste the problem statement manually.",
        );
      }

      // Fallback to legacy single-call approach
      const { problemGenerationPrompt } =
        await import("../services/ai.prompts.js");
      const { system, user } = problemGenerationPrompt({
        category,
        count: problemCount,
        difficulty: difficultyPref,
        targetCompany,
        focusAreas,
        sourceList: curriculum,
        teamContext,
        existingProblems,
      });

      const maxTokens = Math.min(problemCount * 1800, 8000);

      let fallbackResult;
      try {
        fallbackResult = await aiComplete({
          systemPrompt: system,
          userPrompt: user,
          userId: req.user.id,
          teamId: req.teamId,
          model: AI_MODEL_FAST,
          temperature: 0.8,
          maxTokens,
          jsonMode: true,
          surface: "problem-generation-legacy",
        });
      } catch (fallbackErr) {
        return aiErrorResponse(
          res,
          fallbackErr,
          "AI failed to generate problems.",
        );
      }

      if (!fallbackResult.problems?.length) {
        return error(res, "AI failed to generate problems.", 500);
      }

      return success(res, {
        problems: fallbackResult.problems,
        reasoning: fallbackResult.reasoning,
        count: fallbackResult.problems.length,
        category,
        difficulty: difficultyPref,
        sourceList: curriculum,
        pipeline: "legacy",
      });
    }

    if (selections.length === 0) {
      return error(res, "AI failed to select problems.", 500);
    }

    // Pre-fetch existing team titles ONCE for duplicate detection below.
    // Cheap — just id + title, no description or embeddings. At 500 problems
    // this is ~5 KB over the wire; in-memory token-Jaccard per generated
    // title is microseconds. If a team ever reaches 10k problems, move
    // this to a raw SQL trigram query instead.
    const existingTitles = await prisma.problem.findMany({
      where: { teamId },
      select: { id: true, title: true },
    });

    // ── STAGE 3: Content Generation (PARALLEL) ──────────
    // One focused call per problem, all running simultaneously.
    // If one fails, that problem returns partial data — others succeed.
    const contentPromises = selections.map(async (selection) => {
      try {
        const { system: contentSystem, user: contentUser } =
          problemContentGenerationPrompt({
            title: selection.title,
            category,
            difficulty: selection.difficulty,
            platform: selection.platform,
            url: selection.url,
            pattern: selection.pattern,
            targetCompany,
            hrQuestionCategory: selection.hrQuestionCategory || null, // ← ADD THIS
          });

        // Category-specific token budgets and model selection.
        //
        // Research basis for budgets:
        // SYSTEM_DESIGN: needs full problem description with scale requirements,
        //   NFRs, architecture overview, teaching notes (5 sections), follow-ups.
        //   Minimum viable output is ~2800 tokens. Set to 3500 with buffer.
        // LOW_LEVEL_DESIGN: needs entity list, class hierarchy description,
        //   design pattern justification, SOLID analysis, extensibility follow-ups.
        //   Minimum viable output is ~2200 tokens. Set to 2800 with buffer.
        // BEHAVIORAL/HR: narrative content, more concise. 1800 is sufficient.
        // Others: 2000 is adequate with some buffer.
        //
        // Model selection:
        // SYSTEM_DESIGN and LOW_LEVEL_DESIGN require genuine multi-step reasoning
        // about architecture and object relationships. GPT-4o-mini produces shallow
        // SD/LLD content — it names components without understanding trade-offs.
        // GPT-4o produces meaningfully better content for these two categories.
        // Cost delta at 5 problems max is negligible.
        const categoryTokenBudget = {
          SYSTEM_DESIGN: 3500,
          LOW_LEVEL_DESIGN: 2800,
          CODING: 2000,
          BEHAVIORAL: 1800,
          CS_FUNDAMENTALS: 2000,
          SQL: 1800,
          HR: 1500,
        };
        const categoryModel = {
          SYSTEM_DESIGN: AI_MODEL_PRIMARY,
          LOW_LEVEL_DESIGN: AI_MODEL_PRIMARY,
        };
        const contentMaxTokens = categoryTokenBudget[category] || 2000;
        const contentModel = categoryModel[category] || AI_MODEL_FAST;

        let content = await aiComplete({
          systemPrompt: contentSystem,
          userPrompt: contentUser,
          userId: req.user.id,
          teamId: req.teamId,
          model: contentModel,
          temperature: 0.75,
          maxTokens: contentMaxTokens,
          jsonMode: true,
          surface: "problem-content-stage3",
        });

        // Validate per-problem content. On any violation, swap in a
        // clearly-marked stub for THIS problem only — the other parallel
        // generations are unaffected. Admin sees a "[AI Unavailable]" tag
        // on the preview so they can't silently approve a bad row.
        const contentCheck = validateProblemContent(content, { category });
        let usedContentFallback = false;
        if (!contentCheck.valid) {
          console.warn(
            `[problem-content] validation failed for "${selection.title}": ${contentCheck.violations.join(", ")}`,
          );
          content = buildFallbackProblemContent({
            title: selection.title,
            category,
          });
          usedContentFallback = true;
        }

        const isHRProblem = category === "HR";

        return {
          title: selection.title,
          difficulty: selection.difficulty,
          category,
          source: selection.platform,
          // Policy lives in utils/platformSearch.js. Key behavior:
          //   low confidence OR missing URL → platform search URL,
          //   high/medium → the AI-provided URL,
          //   HR → always empty.
          sourceUrl: resolveGeneratedSourceUrl({
            isHRProblem,
            urlConfidence: selection.urlConfidence,
            url: selection.url,
            platform: selection.platform,
            title: selection.title,
          }),
          description: content.description || "",
          // HR: realWorldContext and useCases are empty (not applicable)
          realWorldContext: isHRProblem ? "" : content.realWorldContext || "",
          useCases: isHRProblem ? "" : content.useCases || "",
          adminNotes: content.adminNotes || "",
          // HR: no algorithm tags or company tags
          tags: isHRProblem ? [] : (content.tags || []).filter(Boolean),
          companyTags: isHRProblem
            ? []
            : (content.companyTags || []).filter(Boolean),
          followUpQuestions: content.followUpQuestions || [],
          whySelected: selection.whySelected || "",
          urlConfidence: selection.urlConfidence || "high",
          // Duplicate detection: token-Jaccard against every existing
          // team title. Empty array = no likely duplicates. Admin sees
          // a warning chip on the preview card when this is non-empty.
          similarTo: findSimilarTitles(selection.title, existingTitles),
          // HR: pass hrQuestionCategory through for categoryData storage
          // Uses content.hrQuestionCategory (from Stage 3 AI response) or
          // falls back to selection.hrQuestionCategory (from Stage 2 selection)
          ...(isHRProblem && {
            hrQuestionCategory:
              content.hrQuestionCategory ||
              selection.hrQuestionCategory ||
              null,
          }),
          // Marker for the admin UI — the preview card renders an
          // "AI unavailable, edit before approving" warning when this
          // is true. Distinct from contentGenerationFailed below
          // (which is the hard-throw path); usedFallback covers BOTH
          // hard fails and validation rejects.
          usedFallback: usedContentFallback,
        };
      } catch (err) {
        console.error(
          `Stage 3 content generation failed for "${selection.title}":`,
          err.message,
        );

        // Build a deterministic stub for this slot — clearly marked so
        // the admin must edit before approving. Reuses the same
        // fallback shape as the validation-failure path above.
        const fallbackContent = buildFallbackProblemContent({
          title: selection.title,
          category,
        });
        const isHRProblem = category === "HR";

        return {
          title: selection.title,
          difficulty: selection.difficulty,
          category,
          source: selection.platform,
          // Content generation failed, so we can't trust the URL either;
          // fall back to a platform search so the admin still has
          // something to click when curating.
          sourceUrl: resolveGeneratedSourceUrl({
            isHRProblem,
            urlConfidence: "low",
            url: null,
            platform: selection.platform,
            title: selection.title,
          }),
          description: fallbackContent.description,
          realWorldContext: fallbackContent.realWorldContext,
          useCases: fallbackContent.useCases,
          adminNotes: fallbackContent.adminNotes,
          tags: fallbackContent.tags,
          companyTags: fallbackContent.companyTags,
          followUpQuestions: fallbackContent.followUpQuestions,
          whySelected: selection.whySelected || "",
          urlConfidence: "low",
          similarTo: findSimilarTitles(selection.title, existingTitles),
          ...(isHRProblem && {
            hrQuestionCategory: fallbackContent.hrQuestionCategory,
          }),
          usedFallback: true,
          contentGenerationFailed: true,
        };
      }
    });

    const problems = await Promise.all(contentPromises);

    const successCount = problems.filter(
      (p) => !p.contentGenerationFailed,
    ).length;

    const reasoning = learningPath
      ? `${learningPath} (${successCount}/${problems.length} fully generated)`
      : `Generated ${successCount}/${problems.length} problems for ${category}`;

    return success(res, {
      problems,
      reasoning,
      count: problems.length,
      category,
      difficulty: difficultyPref,
      sourceList: curriculum,
      unrecognizedUrls,
      pipeline: "multi-stage",
      stages: {
        intelligenceGathered: !!teamContext,
        problemsSelected: selections.length,
        contentGenerated: successCount,
      },
    });
  } catch (err) {
    console.error("AI problem generation error:", err);
    return error(res, "Failed to generate problems.", 500);
  }
}
