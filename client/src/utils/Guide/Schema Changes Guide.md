# ProbSolver — Schema Change Guide

**Follow this guide every time you need to modify the database schema. No exceptions.**

---

## The Golden Rule

Every schema change goes through Prisma's migration system. Never modify the database directly with raw SQL. Never create migration files by hand. Never have two migrations touching the same table in conflicting ways [1].

---

## Step-by-Step Workflow

### Step 1 — Edit `schema.prisma` Only

All changes start and end in `server/prisma/schema.prisma`. Whether you're adding a field, creating a model, changing a type, or adding an index — edit the schema file first.

```prisma
// Example: Adding a new field to an existing model
model User {
  // ... existing fields
  newField String?  // ← add here
}
```

```prisma
// Example: Adding a completely new model
model SkillProfile {
  id        String @id @default(cuid())
  userId    String
  user      User   @relation(fields: [userId], references: [id], onDelete: Cascade)
  skillId   String
  score     Float  @default(0)
  
  @@unique([userId, skillId])
  @@index([userId])
  @@map("skill_profiles")
}
```

**Important:** If you add a relation field on a new model (like `user User @relation(...)` above), you MUST also add the back-reference on the related model:

```prisma
model User {
  // ... existing fields
  skillProfiles SkillProfile[]  // ← REQUIRED — Prisma demands both sides
}
```

---

### Step 2 — Generate and Apply the Migration

Run this single command from the `server/` directory:

```bash
cd server
npx prisma migrate dev --name describe_what_you_changed
```

This command does three things automatically:
1. Generates a migration SQL file in `prisma/migrations/[timestamp]_describe_what_you_changed/`
2. Applies the migration to your database
3. Regenerates the Prisma client (`prisma generate`)

**Name the migration descriptively:**
- `add_skill_profile_model` ✓
- `add_verified_field_to_user` ✓
- `update` ✗ (too vague)
- `fix` ✗ (meaningless)

---

### Step 3 — Review the Generated SQL

Open the newly created file:
```
server/prisma/migrations/[timestamp]_describe_what_you_changed/migration.sql
```

Verify it does what you expect. Common things to check:
- Column types are correct
- NOT NULL constraints are present where expected
- Foreign keys have the right ON DELETE behavior
- Indexes exist for fields you'll query frequently

---

### Step 4 — Commit Everything Together

```bash
git add server/prisma/schema.prisma \
        server/prisma/migrations/[timestamp]_describe_what_you_changed/
git commit -m "feat: add [description] — schema migration"
git push origin main
```

**Always commit the schema file AND the migration folder together.** They must stay in sync.

---

### Step 5 — Production Deploys Automatically

Your Railway deployment script (`start:prod`) already runs:
```
npx prisma migrate deploy && node src/index.js
```

This applies any pending migrations in production. No manual intervention needed.

---

## What NOT to Do

| Action | Why It Breaks Things |
|--------|---------------------|
| Run `CREATE TABLE` or `ALTER TABLE` directly against the database | Prisma doesn't know about it → drift detected → future migrations fail |
| Create a migration SQL file by hand and place it in the migrations folder | Prisma never validated it → shadow database replay fails |
| Delete migration folders after they've been applied | Prisma can't replay history → fresh deployments fail → `migrate dev` fails |
| Have two migration files that CREATE and ALTER the same table in conflicting order | Shadow database replays in order → earlier migration references table that doesn't exist yet |
| Edit a migration file after it has been applied | Prisma detects "modified after applied" → refuses to proceed |
| Run `npx prisma migrate reset` on production | **Deletes all data** — only use for local development |

---

## Common Scenarios

### Adding a field to an existing model

```prisma
// 1. Edit schema.prisma
model Solution {
  // existing fields...
  preSessionConfidence Int?  // ← new nullable field
}
```

```bash
# 2. Generate + apply
npx prisma migrate dev --name add_pre_session_confidence_to_solution
```

That's it. Prisma generates `ALTER TABLE "solutions" ADD COLUMN "preSessionConfidence" INT;` automatically.

---

### Adding a new enum

```prisma
// 1. Add the enum in schema.prisma
enum SkillProficiencyLevel {
  NOVICE
  DEVELOPING
  PROFICIENT
  EXPERT
  MASTERY
}

// 2. Use it in a model
model SkillProfile {
  proficiencyLevel SkillProficiencyLevel @default(NOVICE)
}
```

```bash
# 3. Generate + apply
npx prisma migrate dev --name add_skill_proficiency_enum_and_profile
```

---

### Adding a relation between existing models

```prisma
// 1. Add relation field on BOTH models

model User {
  // existing...
  skillProfiles SkillProfile[]  // ← back-reference
}

model SkillProfile {
  userId String
  user   User @relation(fields: [userId], references: [id], onDelete: Cascade)  // ← FK
}
```

```bash
# 2. Generate + apply
npx prisma migrate dev --name add_skill_profile_relation
```

---

### Making a nullable field required (with existing data)

This is the one case that needs extra care:

```bash
# 1. First, backfill existing NULL values in the database
# Run this via Railway's SQL console:
UPDATE solutions SET "newField" = 'default_value' WHERE "newField" IS NULL;

# 2. Then edit schema.prisma to make it required
# Change: newField String?
# To:     newField String

# 3. Generate migration
npx prisma migrate dev --name make_new_field_required
```

---

## If Something Goes Wrong During `migrate dev`

### Error: "Drift detected"

Your database has changes that don't match the migration history. This means someone (or you) ran raw SQL against the database.

**Fix:** If the drift is something you intentionally did (like manually creating an index), create a baseline migration:

```bash
# Create a migration folder
mkdir -p server/prisma/migrations/[timestamp]_baseline_[description]

# Write the SQL that matches what's already in the DB
# Use IF NOT EXISTS to make it safe to replay
echo 'CREATE INDEX IF NOT EXISTS "idx_name" ON "table"("column");' > \
  server/prisma/migrations/[timestamp]_baseline_[description]/migration.sql

# Mark it as already applied
npx prisma migrate resolve --applied "[timestamp]_baseline_[description]"
```

### Error: "Migration failed to apply to shadow database"

The shadow database is a fresh temp database where Prisma replays ALL migrations from scratch. If any migration file has invalid SQL or references a table that doesn't exist at that point in history, this fails.

**Fix:** Check which migration is failing and ensure its SQL is self-contained. A migration that does `ALTER TABLE X` must come AFTER the migration that does `CREATE TABLE X` in chronological order.

### Error: "Modified after applied"

You edited a migration file that was already applied to the database.

**Fix:** Either revert the file to its original content, or if you intentionally changed it, delete the `_prisma_migrations` record for that migration and re-mark it as applied:

```sql
DELETE FROM "_prisma_migrations" WHERE migration_name = '[migration_name]';
```

```bash
npx prisma migrate resolve --applied "[migration_name]"
```

---

## Checklist Before Every Schema Change

- [ ] I am editing `schema.prisma`, not writing raw SQL
- [ ] If adding a relation, I added the back-reference on BOTH models
- [ ] I will run `npx prisma migrate dev --name descriptive_name`
- [ ] I will review the generated SQL before committing
- [ ] I will commit `schema.prisma` AND the migration folder together
- [ ] I am NOT deleting any existing migration folders
- [ ] I am NOT editing any previously applied migration files

---

*This guide prevents the drift errors, shadow database failures, and "table does not exist" issues that occur when Prisma's migration system is bypassed.* [1]