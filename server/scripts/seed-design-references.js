#!/usr/bin/env node
// ============================================================================
// seed-design-references — upsert curated DesignReference rows
// ============================================================================
//
// Reads JSON files from `server/prisma/seeds/design-references/` and
// upserts each as a DesignReference. Each JSON has a `problemTitle` field
// that we use to match against an existing Problem in the DB; we refuse
// to seed a reference if no matching Problem exists (refusing fast is
// better than creating an orphan).
//
// Usage:
//   node server/scripts/seed-design-references.js                 # all files
//   node server/scripts/seed-design-references.js url-shortener    # one file by stem match
//   node server/scripts/seed-design-references.js --team-id X       # constrain problem lookup to a team
//
// Match rules:
//   - Problem lookup: by exact title, case-insensitive. If multiple
//     matches (same-titled problems across teams), --team-id is required.
//   - Variant uniqueness: (problemId, variant) is the DB uniqueness key,
//     so running the script repeatedly is idempotent — it updates in-place.
// ============================================================================
import 'dotenv/config'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PrismaClient } from '@prisma/client'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const SEED_DIR = path.resolve(__dirname, '../prisma/seeds/design-references')

const prisma = new PrismaClient()

function parseArgs(argv) {
    const args = { filter: null, teamId: null }
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i]
        if (a === '--team-id') args.teamId = argv[++i]
        else if (!a.startsWith('--')) args.filter = a
    }
    return args
}

async function findProblemByTitle(title, teamId) {
    const where = { title: { equals: title, mode: 'insensitive' } }
    if (teamId) where.teamId = teamId
    const matches = await prisma.problem.findMany({
        where,
        select: { id: true, title: true, teamId: true, category: true },
    })
    return matches
}

async function upsertReference(seed, matchedProblem) {
    const data = {
        problemId: matchedProblem.id,
        designType: seed.designType,
        difficulty: seed.difficulty,
        variant: seed.variant,
        title: seed.title,
        summary: seed.summary,
        phases: seed.phases || {},
        diagramData: seed.diagramData ?? null,
        componentAnnotations: seed.componentAnnotations ?? null,
        dataFlowDescription: seed.dataFlowDescription ?? null,
        tradeoffs: seed.tradeoffs || [],
        sources: seed.sources || [],
    }
    const existing = await prisma.designReference.findUnique({
        where: { problemId_variant: { problemId: matchedProblem.id, variant: seed.variant } },
    })
    if (existing) {
        await prisma.designReference.update({
            where: { id: existing.id },
            data: { ...data, version: { increment: 1 } },
        })
        return { action: 'updated', id: existing.id }
    }
    const created = await prisma.designReference.create({ data })
    return { action: 'created', id: created.id }
}

async function main() {
    const args = parseArgs(process.argv.slice(2))

    if (!fs.existsSync(SEED_DIR)) {
        console.error(`❌ Seed directory not found: ${SEED_DIR}`)
        process.exit(1)
    }
    const files = fs
        .readdirSync(SEED_DIR)
        .filter((f) => f.endsWith('.json'))
        .filter((f) => !args.filter || f.includes(args.filter))

    if (!files.length) {
        console.error(`❌ No matching seed files in ${SEED_DIR}`)
        process.exit(1)
    }

    console.log(`🌱 Seeding ${files.length} design reference${files.length === 1 ? '' : 's'}...\n`)

    let ok = 0
    let skipped = 0
    for (const file of files) {
        const raw = fs.readFileSync(path.join(SEED_DIR, file), 'utf8')
        let seed
        try { seed = JSON.parse(raw) } catch (err) {
            console.error(`  ⚠️  ${file}: invalid JSON — ${err.message}`)
            skipped++
            continue
        }
        if (!seed.problemTitle) {
            console.error(`  ⚠️  ${file}: missing "problemTitle" — cannot match to a Problem.`)
            skipped++
            continue
        }

        const matches = await findProblemByTitle(seed.problemTitle, args.teamId)
        if (matches.length === 0) {
            console.error(`  ⚠️  ${file}: no Problem with title "${seed.problemTitle}"${args.teamId ? ` in team ${args.teamId}` : ''}. Create the Problem first or pass --team-id.`)
            skipped++
            continue
        }
        if (matches.length > 1) {
            console.error(`  ⚠️  ${file}: ${matches.length} Problems match title "${seed.problemTitle}" across teams. Use --team-id to disambiguate:`)
            for (const m of matches) console.error(`      · ${m.id} (teamId=${m.teamId}, category=${m.category})`)
            skipped++
            continue
        }

        const problem = matches[0]
        try {
            const result = await upsertReference(seed, problem)
            console.log(`  ✅ ${file}: ${result.action} (${result.id}) for problem "${problem.title}"`)
            ok++
        } catch (err) {
            console.error(`  ❌ ${file}: ${err.message}`)
            skipped++
        }
    }

    console.log(`\n${ok} seeded, ${skipped} skipped.`)
}

main()
    .catch((e) => {
        console.error('❌ Seeding failed:', e)
        process.exit(1)
    })
    .finally(async () => {
        await prisma.$disconnect()
    })
