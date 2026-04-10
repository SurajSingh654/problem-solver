/**
 * Prisma Client singleton
 * Import this everywhere you need database access.
 * Never create a new PrismaClient() directly.
 */
import { PrismaClient } from '@prisma/client'

const globalForPrisma = global

const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development'
      ? ['query', 'error', 'warn']
      : ['error'],
  })

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}

export default prisma