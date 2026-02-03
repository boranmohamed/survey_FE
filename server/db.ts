import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";

const { Pool } = pg;

let pool: pg.Pool | null = null;
let db: ReturnType<typeof drizzle> | null = null;

function initializeDb() {
  if (!process.env.DATABASE_URL) {
    console.warn(
      "⚠️  DATABASE_URL is not set. Database features will be unavailable. Set DATABASE_URL to enable database functionality.",
    );
    return;
  }

  try {
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
    db = drizzle(pool, { schema });
  } catch (error) {
    console.warn("⚠️  Failed to initialize database:", error);
  }
}

// Initialize on import
initializeDb();

export { pool };
export { db };

// Helper to get db or throw if not available
export function getDb() {
  if (!db) {
    throw new Error(
      "Database is not configured. Please set DATABASE_URL environment variable.",
    );
  }
  return db;
}
