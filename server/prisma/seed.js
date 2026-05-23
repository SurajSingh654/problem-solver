// ============================================================================
// ProbSolver v3.0 — Database Seed
// ============================================================================
//
// Creates the SUPER_ADMIN account and nothing else.
// All content (teams, problems) is created through the app.
//
// Run: npx prisma db seed
// ============================================================================
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import { seedAIEngineering } from './seeds/topic-ai-engineering.js'

const prisma = new PrismaClient()

async function ensurePersonalTeam(user) {
  // Mirrors the personal-team creation in auth.controller.js individual-mode
  // path. Idempotent: if the user already has personalTeamId, no-op.
  if (user.personalTeamId) return

  await prisma.$transaction(async (tx) => {
    const personalTeam = await tx.team.create({
      data: {
        name: `${user.name}'s Space`,
        description: 'Personal practice space',
        isPersonal: true,
        status: 'ACTIVE',
        createdById: user.id,
        maxMembers: 1,
        aiProblemsEnabled: true,
      },
    })
    await tx.user.update({
      where: { id: user.id },
      data: {
        personalTeamId: personalTeam.id,
        currentTeamId: personalTeam.id,
        teamRole: 'TEAM_ADMIN',
      },
    })
    await tx.teamMembership.create({
      data: {
        userId: user.id,
        teamId: personalTeam.id,
        role: 'TEAM_ADMIN',
        isActive: true,
      },
    })
  })
  console.log(`   ✓ Personal team attached to ${user.email}`)
}

async function ensureSuperAdmin() {
  const email = process.env.SUPER_ADMIN_EMAIL || 'admin@probsolver.com'
  const password = process.env.SUPER_ADMIN_PASSWORD || 'Admin@123456'
  const name = process.env.SUPER_ADMIN_NAME || 'Platform Admin'

  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true, name: true, email: true, personalTeamId: true },
  })
  if (existing) {
    console.log(`✅ SUPER_ADMIN already exists: ${email}`)
    // Self-heal admins seeded before the personal-team logic was added.
    // Without a team, requireTeamContext rejects every team-scoped endpoint
    // (including /stats/showcase) with SUPER_ADMIN_NEEDS_TEAM_OVERRIDE.
    await ensurePersonalTeam(existing)
    console.log('')
    return
  }

  const hashedPassword = await bcrypt.hash(password, 12)
  const admin = await prisma.user.create({
    data: {
      email,
      password: hashedPassword,
      name,
      globalRole: 'SUPER_ADMIN',
      isVerified: true,
      onboardingComplete: true,
      activityStatus: 'ACTIVE',
      lastActiveAt: new Date(),
    },
  })

  console.log('✅ SUPER_ADMIN created:')
  console.log(`   Email:    ${email}`)
  console.log(`   Password: ${password}`)
  console.log(`   ID:       ${admin.id}`)
  console.log(`   Role:     ${admin.globalRole}`)
  console.log('⚠️  Change the password after first login!')

  await ensurePersonalTeam(admin)
  console.log('')
}

async function ensurePgVector() {
  console.log('📐 Setting up pgvector...')
  try {
    await prisma.$executeRawUnsafe('CREATE EXTENSION IF NOT EXISTS vector;')
    console.log('✅ pgvector extension enabled\n')
  } catch (err) {
    console.log('⚠️  pgvector extension may already exist or is not available')
    console.log(`   ${err.message}\n`)
  }
}

async function main() {
  console.log('🌱 Seeding ProbSolver v3.0...\n')

  // Each step is independently idempotent — running them all on every seed
  // makes the dev DB state predictable regardless of prior runs.
  await ensureSuperAdmin()
  await ensurePgVector()
  await seedAIEngineering()

  console.log('\n🎉 Seed complete! Start the server and log in.\n')
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })