// ============================================================================
// ProbSolver v3.0 — Backfill TeamMembership for existing users
// Run ONCE after migration: node prisma/backfill_memberships.js
// ============================================================================
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("\n🌱 Backfilling team memberships...\n");

  const users = await prisma.user.findMany({
    where: { deletedAt: null },
    select: {
      id: true,
      name: true,
      currentTeamId: true,
      personalTeamId: true,
      teamRole: true,
    },
  });

  console.log(`Found ${users.length} users\n`);

  let created = 0;
  let errors = 0;

  for (const user of users) {
    const membershipsToCreate = [];

    // Personal team membership — every user with a personal team
    if (user.personalTeamId) {
      membershipsToCreate.push({
        userId: user.id,
        teamId: user.personalTeamId,
        role: "TEAM_ADMIN", // always admin of own personal space
        isActive: true,
      });
    }

    // Real team membership — if currently in a non-personal team
    if (user.currentTeamId && user.currentTeamId !== user.personalTeamId) {
      membershipsToCreate.push({
        userId: user.id,
        teamId: user.currentTeamId,
        role: user.teamRole || "MEMBER",
        isActive: true,
      });
    }

    for (const data of membershipsToCreate) {
      try {
        await prisma.teamMembership.upsert({
          where: {
            userId_teamId: { userId: data.userId, teamId: data.teamId },
          },
          create: data,
          update: { role: data.role, isActive: data.isActive },
        });
        console.log(`  ✅ ${user.name} → ${data.teamId} as ${data.role}`);
        created++;
      } catch (err) {
        console.error(`  ❌ ${user.name}: ${err.message}`);
        errors++;
      }
    }
  }

  console.log(`\n✅ Done: ${created} memberships created, ${errors} errors\n`);
}

main()
  .catch((e) => {
    console.error("❌ Failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
