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

const prisma = new PrismaClient()

async function main() {
  const email = process.env.SUPER_ADMIN_EMAIL || 'admin@probsolver.com'
  const password = process.env.SUPER_ADMIN_PASSWORD || 'Admin@123456'
  const name = process.env.SUPER_ADMIN_NAME || 'Platform Admin'

  console.log('🌱 Seeding ProbSolver v3.0...\n')

  // ── Check if SUPER_ADMIN already exists ────────────
  const existing = await prisma.user.findUnique({ where: { email } })

  if (existing) {
    console.log(`✅ SUPER_ADMIN already exists: ${email}`)
    console.log('   Skipping seed.\n')
    return
  }

  // ── Create SUPER_ADMIN ─────────────────────────────
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
  console.log('')
  console.log('⚠️  Change the password after first login!')
  console.log('')

  // ── Run manual vector setup ────────────────────────
  console.log('📐 Setting up pgvector...')
  try {
    await prisma.$executeRawUnsafe('CREATE EXTENSION IF NOT EXISTS vector;')
    console.log('✅ pgvector extension enabled\n')
  } catch (err) {
    console.log('⚠️  pgvector extension may already exist or is not available')
    console.log(`   ${err.message}\n`)
  }

  console.log('🎉 Seed complete! Start the server and log in.\n')
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })