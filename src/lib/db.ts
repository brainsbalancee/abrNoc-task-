import { PrismaClient } from '@prisma/client'

// Prisma client singleton.
// Query logging is deliberately OFF in production and in tests to keep logs
// useful at 3am. Enable via DEBUG_QUERIES=1 if you need to profile.
const shouldLogQueries = process.env.DEBUG_QUERIES === '1'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: shouldLogQueries
      ? ['query', 'error', 'warn']
      : ['error', 'warn'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
