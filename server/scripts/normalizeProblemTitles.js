// ============================================================================
// One-shot — repair problem titles that landed in the DB before the AI prompt
// was tightened to require canonical Title Case. Reuses the same
// `normalizeProblemTitle` helper the live ingest path now uses, so dry-run
// output here matches what the API would produce on a fresh generation.
//
// USAGE:
//   node scripts/normalizeProblemTitles.js                # dry-run (default; prints diff, writes nothing)
//   node scripts/normalizeProblemTitles.js --apply        # actually write the updates
//   node scripts/normalizeProblemTitles.js --teamId=<id>  # scope to one team (optional)
//
// SAFE TO RE-RUN. The helper is a no-op for already-correct mixed-case titles,
// so re-running after --apply finds zero changes.
// ============================================================================

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { normalizeProblemTitle } from "../src/utils/titleSimilarity.js";

const prisma = new PrismaClient();

function parseArgs(argv) {
  const apply = argv.includes("--apply");
  const teamArg = argv.find((a) => a.startsWith("--teamId="));
  const teamId = teamArg ? teamArg.slice("--teamId=".length) : null;
  return { apply, teamId };
}

async function main() {
  const { apply, teamId } = parseArgs(process.argv.slice(2));

  const where = teamId ? { teamId } : {};
  const problems = await prisma.problem.findMany({
    where,
    select: { id: true, title: true, teamId: true },
  });

  const changes = [];
  for (const p of problems) {
    const next = normalizeProblemTitle(p.title);
    if (next !== p.title) {
      changes.push({ id: p.id, before: p.title, after: next });
    }
  }

  console.log(`Scanned ${problems.length} problem${problems.length === 1 ? "" : "s"}${teamId ? ` in team ${teamId}` : ""}.`);
  console.log(`${changes.length} need normalization.`);
  if (changes.length === 0) {
    await prisma.$disconnect();
    return;
  }

  console.log("");
  for (const c of changes) {
    console.log(`  ${c.id}`);
    console.log(`    -  ${c.before}`);
    console.log(`    +  ${c.after}`);
  }

  if (!apply) {
    console.log("");
    console.log("Dry-run only — no changes written. Re-run with --apply to commit.");
    await prisma.$disconnect();
    return;
  }

  console.log("");
  console.log("Applying updates...");
  let written = 0;
  for (const c of changes) {
    await prisma.problem.update({
      where: { id: c.id },
      data: { title: c.after },
    });
    written++;
  }
  console.log(`Updated ${written} problem${written === 1 ? "" : "s"}.`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
