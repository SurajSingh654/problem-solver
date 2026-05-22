// ============================================================================
// Topic Mastery Tracks — AI Engineering seed
// ============================================================================
//
// Creates the AI Engineering Topic + an 11-Concept curriculum graph in DRAFT
// status. Idempotent (won't duplicate on re-run).
//
// Concepts cover: LLM fundamentals, prompting, embeddings, vector DBs, RAG,
// tool use, agents, MCP, LangChain/LangGraph, evaluations, production concerns.
//
// SAFETY: every Concept ships in DRAFT — invisible to user-facing endpoints.
// Lesson bodies are author drafts written by the platform owner; admin must
// review and publish before any user sees them. The lesson content is
// Anthropic-flavored; admin's publish-time editorial pass is the right place
// to map principles onto this project's OpenAI stack (OpenAI auto prompt
// caching, function calling = tool use, etc.).
//
// Run from server/: npx prisma db seed   (after the parent seed.js is wired)
//   OR directly:    node prisma/seeds/topic-ai-engineering.js
// ============================================================================

import 'dotenv/config'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const LESSONS_DIR = path.join(__dirname, 'ai-engineering-lessons')

const TOPIC = {
  slug: 'ai-engineering',
  name: 'AI Engineering',
  description:
    'Build and operate LLM applications: prompting, embeddings, RAG, tool use, ' +
    'agents, evals, observability. The discipline of shipping AI features that ' +
    'survive production.',
  category: 'AI_ENGINEERING',
  mockInterviewCategory: null, // engineering practices, no 1:1 interview category
  estimatedHoursToMastery: 60, // ~7-8 weeks @ 1hr/day; lighter than System Design
}

// Concept graph — order matters. `prereqs` resolved by slug in second pass.
// `lessonFile` points at the markdown body that becomes `primerMarkdown`.
const CONCEPTS = [
  {
    slug: 'llm-fundamentals',
    name: 'LLM fundamentals',
    order: 1,
    lessonFile: '01-llm-fundamentals.md',
    expectedQuestions: [
      'What is a token, and why does it matter for cost and latency?',
      'Why is `temperature=0` not deterministic across runs?',
      'What is the practical difference between input and output tokens for cost?',
      'Why are LLMs called "stateless," and what does that mean for chat applications?',
    ],
    canonicalSources: [
      { title: 'What is a Claude model?', url: 'https://docs.claude.com/en/docs/about-claude/models/overview', type: 'docs' },
    ],
    prereqs: [],
  },
  {
    slug: 'prompting',
    name: 'Prompting',
    order: 2,
    lessonFile: '02-prompting.md',
    expectedQuestions: [
      'Where do stable instructions belong vs per-request data, and why?',
      'When does few-shot beat zero-shot, and what does a good few-shot example look like?',
      'Why is prompt caching the highest-ROI production technique for long system prompts?',
      'What are the most common prompting pitfalls, and how do you avoid them?',
    ],
    canonicalSources: [
      { title: 'Prompt engineering overview', url: 'https://docs.claude.com/en/docs/build-with-claude/prompt-engineering/overview', type: 'docs' },
    ],
    prereqs: ['llm-fundamentals'],
  },
  {
    slug: 'embeddings',
    name: 'Embeddings',
    order: 3,
    lessonFile: '03-embeddings.md',
    expectedQuestions: [
      'What does it mean for two texts to "have similar embeddings"?',
      'Why is cosine similarity the default metric for text embeddings?',
      'What happens if you upgrade your embedding model on existing data?',
      'When are embeddings the wrong tool for the job?',
    ],
    canonicalSources: [
      { title: 'Embeddings', url: 'https://docs.claude.com/en/docs/build-with-claude/embeddings', type: 'docs' },
      { title: 'MTEB Leaderboard', url: 'https://huggingface.co/spaces/mteb/leaderboard', type: 'docs' },
    ],
    prereqs: ['llm-fundamentals'],
  },
  {
    slug: 'vector-databases',
    name: 'Vector databases',
    order: 4,
    lessonFile: '04-vector-databases.md',
    expectedQuestions: [
      'How does HNSW achieve approximate nearest-neighbor search faster than brute force?',
      'When should you reach for BM25 / full-text search instead of vector search?',
      'Why is metadata filtering critical for high-quality retrieval?',
      'What\'s the trade-off between recall and speed in ANN indexes?',
    ],
    canonicalSources: [
      { title: 'pgvector', url: 'https://github.com/pgvector/pgvector', type: 'docs' },
      { title: 'HNSW Paper', url: 'https://arxiv.org/abs/1603.09320', type: 'paper' },
    ],
    prereqs: ['embeddings'],
  },
  {
    slug: 'rag',
    name: 'Retrieval-Augmented Generation (RAG)',
    order: 5,
    lessonFile: '05-rag.md',
    expectedQuestions: [
      'Why use RAG instead of stuffing documents into a long-context prompt?',
      'What are the three failure modes of retrieval, and how do you diagnose which one you\'re hitting?',
      'When is HyDE / query rewriting worth the extra LLM call?',
      'Why must every RAG answer cite sources?',
    ],
    canonicalSources: [
      { title: 'Retrieval-Augmented Generation (RAG)', url: 'https://docs.claude.com/en/docs/build-with-claude/retrieval', type: 'docs' },
      { title: 'Citations', url: 'https://docs.claude.com/en/docs/build-with-claude/citations', type: 'docs' },
    ],
    prereqs: ['embeddings', 'vector-databases'],
  },
  {
    slug: 'tool-use',
    name: 'Tool use',
    order: 6,
    lessonFile: '06-tool-use.md',
    expectedQuestions: [
      'Why is tool use a multi-turn dance and not a single response?',
      'How do you use tool definitions for reliable structured output?',
      'What\'s the safest way to handle a hallucinated or malformed tool call?',
      'When should you set `tool_choice` to force a specific tool?',
    ],
    canonicalSources: [
      { title: 'Tool use overview', url: 'https://docs.claude.com/en/docs/build-with-claude/tool-use/overview', type: 'docs' },
    ],
    prereqs: ['prompting'],
  },
  {
    slug: 'agents',
    name: 'Agents',
    order: 7,
    lessonFile: '07-agents.md',
    expectedQuestions: [
      'What are the four stopping conditions every agent loop needs?',
      'When does the abstraction tax of LangGraph (or any framework) start to pay off?',
      'How do prompt caching strategies change in long-running agent sessions?',
      'What safety controls should gate destructive tools in an agent?',
    ],
    canonicalSources: [
      { title: 'Building agents', url: 'https://docs.claude.com/en/docs/agents-and-tools/computer-use', type: 'docs' },
    ],
    prereqs: ['tool-use'],
  },
  {
    slug: 'mcp',
    name: 'Model Context Protocol (MCP)',
    order: 8,
    lessonFile: '08-mcp.md',
    expectedQuestions: [
      'What problem does MCP solve that ad-hoc tool definitions cannot?',
      'When is plain in-process tool use the right choice over MCP?',
      'What are the three primitives an MCP server can expose?',
      'What is the security model of an MCP server, and what should you check before installing one?',
    ],
    canonicalSources: [
      { title: 'Model Context Protocol', url: 'https://modelcontextprotocol.io', type: 'docs' },
      { title: 'Anthropic MCP docs', url: 'https://docs.claude.com/en/docs/agents-and-tools/mcp', type: 'docs' },
    ],
    prereqs: ['tool-use'],
  },
  {
    slug: 'langchain-langgraph',
    name: 'LangChain vs LangGraph',
    order: 9,
    lessonFile: '09-langchain-vs-langgraph.md',
    expectedQuestions: [
      'What\'s the practical difference between LangChain primitives and LangGraph workflows?',
      'When should you reach for LangGraph instead of writing the loop yourself?',
      'Why does this guide avoid LangChain "chains" but adopt LangGraph?',
      'What does LangGraph buy you for debugging that a hand-rolled loop doesn\'t?',
    ],
    canonicalSources: [
      { title: 'LangGraph docs', url: 'https://langchain-ai.github.io/langgraph/', type: 'docs' },
    ],
    prereqs: ['agents'],
  },
  {
    slug: 'evaluations',
    name: 'Evaluations',
    order: 10,
    lessonFile: '10-evaluations.md',
    expectedQuestions: [
      'Why are LLM evals harder than unit tests, and how do you design around that?',
      'When is exact-match the right grader, and when must you use LLM-as-judge?',
      'What biases does LLM-as-judge introduce, and how do you mitigate them?',
      'Why is pairwise comparison preferred over absolute 1–5 scoring?',
    ],
    canonicalSources: [
      { title: 'Evaluating prompts', url: 'https://docs.claude.com/en/docs/test-and-evaluate/develop-tests', type: 'docs' },
    ],
    prereqs: ['llm-fundamentals'],
  },
  {
    slug: 'production-concerns',
    name: 'Production concerns',
    order: 11,
    lessonFile: '11-production-concerns.md',
    expectedQuestions: [
      'What\'s the production-readiness checklist for any new AI feature?',
      'How do you mitigate prompt injection from untrusted retrieved content?',
      'What observability signals are non-negotiable for an AI system in production?',
      'How do you plan for model versioning and migrations?',
    ],
    canonicalSources: [
      { title: 'Langfuse', url: 'https://langfuse.com', type: 'docs' },
      { title: 'Arize Phoenix', url: 'https://phoenix.arize.com', type: 'docs' },
    ],
    prereqs: ['prompting', 'agents', 'evaluations'],
  },
]

function readLesson(filename) {
  const fp = path.join(LESSONS_DIR, filename)
  if (!fs.existsSync(fp)) {
    throw new Error(`Lesson file missing: ${fp}`)
  }
  return fs.readFileSync(fp, 'utf8')
}

async function seedAIEngineering() {
  console.log('🤖 Seeding Topic Mastery Track: AI Engineering...')

  // Idempotent upsert at the Topic level — re-runs won't duplicate.
  const topic = await prisma.topic.upsert({
    where: { slug: TOPIC.slug },
    create: TOPIC,
    update: {
      // Don't clobber status/publishedAt on re-run — admin owns those.
      name: TOPIC.name,
      description: TOPIC.description,
      category: TOPIC.category,
      mockInterviewCategory: TOPIC.mockInterviewCategory,
      estimatedHoursToMastery: TOPIC.estimatedHoursToMastery,
    },
  })
  console.log(`   ✓ Topic: ${topic.slug} (${topic.status})`)

  // First pass — upsert concepts (without prereq edges yet).
  const conceptsBySlug = {}
  for (const c of CONCEPTS) {
    const primerMarkdown = readLesson(c.lessonFile)
    const created = await prisma.concept.upsert({
      where: { topicId_slug: { topicId: topic.id, slug: c.slug } },
      create: {
        topicId: topic.id,
        slug: c.slug,
        name: c.name,
        order: c.order,
        primerMarkdown,
        workedExample: null,
        canonicalSources: c.canonicalSources ?? [],
        expectedQuestions: c.expectedQuestions ?? [],
        assessmentCriteria: { quizThreshold: 0.8, practiceMin: 1, teachingExpected: false },
      },
      update: {
        // Hands-off rule: don't clobber published primer/sources/questions.
        // Only refresh structural fields (name + order).
        name: c.name,
        order: c.order,
      },
    })
    conceptsBySlug[c.slug] = created
  }

  // Second pass — wire prereqs. Idempotent via the (conceptId, prereqId)
  // unique constraint.
  for (const c of CONCEPTS) {
    if (!c.prereqs?.length) continue
    for (const prereqSlug of c.prereqs) {
      const concept = conceptsBySlug[c.slug]
      const prereq = conceptsBySlug[prereqSlug]
      if (!concept || !prereq) continue
      try {
        await prisma.conceptDependency.create({
          data: { conceptId: concept.id, prereqId: prereq.id },
        })
      } catch (err) {
        if (err?.code !== 'P2002') throw err
      }
    }
  }

  console.log(`   ✓ ${CONCEPTS.length} concepts seeded in DRAFT status`)
  console.log('   ⚠ Lesson bodies are author drafts — admin must review + publish before user exposure.')
}

// ── Module mode (called from parent seed.js) ──────────────────────
export default seedAIEngineering
export { seedAIEngineering }

// ── Standalone CLI mode ────────────────────────────────────────────
const isMain = import.meta.url === `file://${process.argv[1]}`
if (isMain) {
  seedAIEngineering()
    .catch((e) => {
      console.error('❌ Seed failed:', e)
      process.exit(1)
    })
    .finally(() => prisma.$disconnect())
}
