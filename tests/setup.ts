// Test preload — runs BEFORE any test file or its imports are evaluated.
// This ensures `@/lib/db`'s PrismaClient singleton reads the TEST database,
// not the demo database, so tests never touch demo data.
//
// Configured in bunfig.toml as [test] preload.
import path from 'path'

const TEST_DB_PATH = path.join(process.cwd(), 'db', 'test.db')
process.env.DATABASE_URL = `file:${TEST_DB_PATH}`
