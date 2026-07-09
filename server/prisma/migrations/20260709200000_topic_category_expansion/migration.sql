-- Primer Phase D: TopicCategory enum expansion + Topic.subCategory column
--
-- Adds four new curriculum-category slots so future Topics can be filed
-- under programming-language / framework / SQL / NoSQL curricula. The
-- section-model primer (Phase B) already accommodates the content shapes
-- these categories need — this migration just gives Topic.category the
-- vocabulary to name them.
--
-- Also adds Topic.subCategory (nullable text) for finer-grain sorting
-- within a grouped category:
--   PROGRAMMING_LANGUAGE → "Advanced Java" / "Python" / "Kotlin" / …
--   FRAMEWORK            → "Spring Boot" / "React" / "Angular" / …
--   SQL                  → "PostgreSQL" / "MySQL" / …
--   NOSQL                → "MongoDB" / "Redis" / …
-- Left NULL for categories that don't need finer grain (DSA, HLD, LLD, …).
--
-- Idempotent: `IF NOT EXISTS` on both the enum adds and the column add
-- makes this safe to re-run against a partially-migrated DB.
-- Postgres 12+ allows `ALTER TYPE ... ADD VALUE` inside a transaction,
-- which Prisma migrations run in — Railway uses PG 15+, so this is fine.

-- ── 1. Enum values ──────────────────────────────────────────────────

ALTER TYPE "TopicCategory" ADD VALUE IF NOT EXISTS 'PROGRAMMING_LANGUAGE';
ALTER TYPE "TopicCategory" ADD VALUE IF NOT EXISTS 'FRAMEWORK';
ALTER TYPE "TopicCategory" ADD VALUE IF NOT EXISTS 'SQL';
ALTER TYPE "TopicCategory" ADD VALUE IF NOT EXISTS 'NOSQL';

-- ── 2. Topic.subCategory column ──────────────────────────────────────

ALTER TABLE "topics" ADD COLUMN IF NOT EXISTS "subCategory" TEXT;

-- ── 3. Composite index on (category, subCategory) ───────────────────
-- Feeds the "list topics by discipline" filter view. Kept narrow — most
-- filter reads land on (teamId, status) which is already indexed.

CREATE INDEX IF NOT EXISTS "topics_category_subCategory_idx"
    ON "topics" ("category", "subCategory");
