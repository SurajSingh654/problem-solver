// ============================================================================
// Topic Mastery Tracks — System Design seed
// ============================================================================
//
// Creates the System Design Topic + a skeleton concept graph in DRAFT
// status. Idempotent (won't duplicate on re-run).
//
// SAFETY: every Concept ships in DRAFT — invisible to user-facing endpoints.
// An admin must author + review + publish before any of this surfaces.
// The primer/workedExample placeholders below are explicitly marked as
// requiring authoring; they are NOT the final user-facing content.
//
// Run from server/: npx prisma db seed   (after the parent seed.js is wired)
//   OR directly:    node prisma/seeds/topic-system-design.js
// ============================================================================

import 'dotenv/config'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const TOPIC = {
  slug: 'system-design',
  name: 'System Design',
  description:
    'Design real-world systems at scale: load balancing, caching, sharding, ' +
    'consistency, queues, observability. Pairs with Mock Interview SYSTEM_DESIGN ' +
    'category for VALIDATE stage.',
  category: 'SYSTEM_DESIGN',
  mockInterviewCategory: 'SYSTEM_DESIGN',
  estimatedHoursToMastery: 80,  // ~10 weeks @ 1hr/day
}

// Concept graph — order matters. Each concept lists `prereqs` by slug.
// PRIMER + WORKED EXAMPLE BELOW ARE SKELETON PLACEHOLDERS, NOT FINAL
// CONTENT. Admin authors the real primers before publishing.
const CONCEPTS = [
  // ── Layer 1: Vocabulary (no prereqs) ─────────────────────────────
  {
    slug: 'http-rest',
    name: 'HTTP & REST',
    order: 1,
    primerMarkdown: '[DRAFT — requires admin authoring before publish]\n\nWhat HTTP is, what REST means, when to choose REST vs gRPC vs WebSockets.',
    expectedQuestions: [
      'When would you choose gRPC over REST?',
      'What are the semantic differences between PUT and PATCH?',
      'Why is HTTP/2 a meaningful improvement over HTTP/1.1?',
    ],
    canonicalSources: [
      { title: 'HTTP/1.1 RFC 7230', url: 'https://tools.ietf.org/html/rfc7230', type: 'docs' },
      { title: 'gRPC Concepts', url: 'https://grpc.io/docs/what-is-grpc/core-concepts/', type: 'docs' },
    ],
    prereqs: [],
  },
  {
    slug: 'tcp-vs-udp',
    name: 'TCP vs UDP',
    order: 2,
    primerMarkdown: '[DRAFT — requires admin authoring before publish]\n\nReliable ordered delivery vs lightweight unordered. Use cases.',
    expectedQuestions: [
      'Why does video streaming often prefer UDP over TCP?',
      'What does the TCP three-way handshake actually accomplish?',
    ],
    canonicalSources: [],
    prereqs: [],
  },
  {
    slug: 'dns',
    name: 'DNS & CDN',
    order: 3,
    primerMarkdown: '[DRAFT — requires admin authoring before publish]\n\nName resolution, recursive vs iterative, TTL, CDN edge caching.',
    expectedQuestions: [
      'How does DNS caching create stale-data problems on deployments?',
      'Why does a CDN reduce latency for static assets?',
    ],
    canonicalSources: [],
    prereqs: [],
  },
  {
    slug: 'sql-vs-nosql',
    name: 'SQL vs NoSQL — categorical overview',
    order: 4,
    primerMarkdown: '[DRAFT — requires admin authoring before publish]\n\nRelational vs document/wide-column/key-value/graph. When each fits.',
    expectedQuestions: [
      'When does eventual consistency become unacceptable?',
      'Why do social-graph apps use graph DBs?',
    ],
    canonicalSources: [],
    prereqs: [],
  },

  // ── Layer 2: Core scaling primitives ─────────────────────────────
  {
    slug: 'load-balancing',
    name: 'Load Balancing',
    order: 5,
    primerMarkdown: '[DRAFT — requires admin authoring before publish]\n\nL4 vs L7, round-robin, least-connections, sticky sessions, health checks.',
    workedExample: '[DRAFT] Walk through how a request routes through ALB → ECS → application instance.',
    expectedQuestions: [
      'When would sticky sessions be the wrong choice?',
      'How does L7 differ from L4 in tradeoff terms?',
    ],
    canonicalSources: [],
    prereqs: ['http-rest', 'tcp-vs-udp'],
  },
  {
    slug: 'caching-strategies',
    name: 'Caching Strategies',
    order: 6,
    primerMarkdown: '[DRAFT — requires admin authoring before publish]\n\nWrite-through, write-back, write-around, cache-aside; LRU/LFU/TTL eviction; invalidation.',
    workedExample: '[DRAFT] Stack a CDN + Redis + DB row-cache for a high-read API.',
    expectedQuestions: [
      'What is the cache-stampede problem and how do you mitigate it?',
      'Why is cache invalidation hard?',
    ],
    canonicalSources: [],
    prereqs: ['dns'],
  },
  {
    slug: 'database-replication',
    name: 'Database Replication',
    order: 7,
    primerMarkdown: '[DRAFT — requires admin authoring before publish]\n\nMaster-slave, multi-master, async vs sync replication, failover.',
    expectedQuestions: [
      'How does replication lag manifest in user-visible behavior?',
      'When does multi-master replication become a liability?',
    ],
    canonicalSources: [],
    prereqs: ['sql-vs-nosql'],
  },
  {
    slug: 'sharding',
    name: 'Database Sharding',
    order: 8,
    primerMarkdown: '[DRAFT — requires admin authoring before publish]\n\nRange, hash, geographic; resharding pain; the cross-shard join problem.',
    workedExample: '[DRAFT] Shard a posts table by userId; trade-offs.',
    expectedQuestions: [
      'Why is consistent hashing useful for resharding?',
      'How do you handle a hot shard?',
    ],
    canonicalSources: [],
    prereqs: ['database-replication'],
  },

  // ── Layer 3: Distributed systems concepts ────────────────────────
  {
    slug: 'cap-pacelc',
    name: 'CAP Theorem & PACELC',
    order: 9,
    primerMarkdown: '[DRAFT — requires admin authoring before publish]\n\nWhat CAP actually says (and doesn\'t). PACELC extension. CP vs AP system examples.',
    expectedQuestions: [
      'Argue why a banking core picks CP and a social feed picks AP.',
      'What is a common misreading of CAP?',
    ],
    canonicalSources: [
      { title: 'Brewer (2000) "Towards Robust Distributed Systems"', url: 'https://www.cs.berkeley.edu/~brewer/cs262b-2004/PODC-keynote.pdf', type: 'paper' },
    ],
    prereqs: ['database-replication'],
  },
  {
    slug: 'consistency-models',
    name: 'Consistency Models',
    order: 10,
    primerMarkdown: '[DRAFT — requires admin authoring before publish]\n\nStrong, eventual, read-your-writes, monotonic-reads, causal. Practical implications.',
    expectedQuestions: [
      'Why is read-your-writes weaker than strong consistency?',
      'When does a user notice eventual consistency in a real product?',
    ],
    canonicalSources: [],
    prereqs: ['cap-pacelc'],
  },
  {
    slug: 'message-queues',
    name: 'Message Queues & Pub/Sub',
    order: 11,
    primerMarkdown: '[DRAFT — requires admin authoring before publish]\n\nKafka vs RabbitMQ vs SQS. At-least-once vs exactly-once. Idempotency.',
    workedExample: '[DRAFT] Order-processing pipeline that handles duplicate messages.',
    expectedQuestions: [
      'How do you achieve exactly-once semantics in practice?',
      'Why is fan-out via pub/sub better than synchronous fan-out for some workloads?',
    ],
    canonicalSources: [],
    prereqs: ['load-balancing'],
  },

  // ── Layer 4: Architecture patterns ───────────────────────────────
  {
    slug: 'microservices-vs-monolith',
    name: 'Microservices vs Monolith',
    order: 12,
    primerMarkdown: '[DRAFT — requires admin authoring before publish]\n\nWhen each makes sense. The hidden ops cost of microservices.',
    expectedQuestions: [
      'Argue against microservices for a 5-engineer startup.',
      'What is a "distributed monolith" and why is it the worst case?',
    ],
    canonicalSources: [],
    prereqs: ['load-balancing', 'message-queues'],
  },
  {
    slug: 'observability',
    name: 'Observability — logs, metrics, traces',
    order: 13,
    primerMarkdown: '[DRAFT — requires admin authoring before publish]\n\nThe three pillars. SLI/SLO/SLA. Distributed tracing.',
    expectedQuestions: [
      'Why do distributed traces matter that metrics + logs don\'t cover?',
      'What is the difference between a percentile (p99) and an average?',
    ],
    canonicalSources: [
      { title: 'Google SRE Book — Service Level Objectives', url: 'https://sre.google/sre-book/service-level-objectives/', type: 'book' },
    ],
    prereqs: ['microservices-vs-monolith'],
  },

  // ── Layer 5: Canonical case studies ──────────────────────────────
  {
    slug: 'design-tinyurl',
    name: 'Case Study — TinyURL',
    order: 14,
    primerMarkdown: '[DRAFT — requires admin authoring before publish]\n\nSimplest end-to-end design. Encoding, storage, redirect path.',
    workedExample: '[DRAFT] Walk a candidate-quality design end to end.',
    canonicalSources: [],
    prereqs: ['caching-strategies', 'sharding'],
  },
  {
    slug: 'design-twitter-feed',
    name: 'Case Study — Twitter / Threads Feed',
    order: 15,
    primerMarkdown: '[DRAFT — requires admin authoring before publish]\n\nFan-out-on-write vs fan-out-on-read. Celebrity problem.',
    canonicalSources: [],
    prereqs: ['caching-strategies', 'message-queues'],
  },
]

async function seedSystemDesign() {
  console.log('🎓 Seeding Topic Mastery Track: System Design...')

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
    const created = await prisma.concept.upsert({
      where: { topicId_slug: { topicId: topic.id, slug: c.slug } },
      create: {
        topicId: topic.id,
        slug: c.slug,
        name: c.name,
        order: c.order,
        primerMarkdown: c.primerMarkdown,
        workedExample: c.workedExample ?? null,
        canonicalSources: c.canonicalSources ?? [],
        expectedQuestions: c.expectedQuestions ?? [],
        assessmentCriteria: { quizThreshold: 0.8, practiceMin: 1, teachingExpected: false },
      },
      update: {
        // Same hands-off rule as Topic — don't clobber published content.
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
        // Unique-constraint violation = already wired. Anything else is real.
        if (err?.code !== 'P2002') throw err
      }
    }
  }

  const draftCount = CONCEPTS.length
  console.log(`   ✓ ${draftCount} concepts seeded in DRAFT status`)
  console.log(`   ⚠ All content is placeholder — admin must author + publish before user exposure.`)
}

// ── Module mode (called from parent seed.js) ──────────────────────
export default seedSystemDesign

// ── Standalone CLI mode ────────────────────────────────────────────
const isMain = import.meta.url === `file://${process.argv[1]}`
if (isMain) {
  seedSystemDesign()
    .catch((e) => {
      console.error('❌ Seed failed:', e)
      process.exit(1)
    })
    .finally(() => prisma.$disconnect())
}
