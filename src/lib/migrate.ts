import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { db } from "./db.js";
import { logger } from "./logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const MIGRATIONS_DIR = resolve(__dirname, "../../migrations");
const META_TABLE = "schema_migrations";

async function getAppliedMigrations(): Promise<Set<string>> {
  const exists = await db.schema.hasTable(META_TABLE);
  if (!exists) {
    await db.schema.createTable(META_TABLE, (table) => {
      table.string("filename").primary();
      table.timestamp("applied_at", { useTz: true }).defaultTo(db.fn.now());
    });
    return new Set();
  }

  const rows = await db(META_TABLE).select("filename");
  return new Set(rows.map((r: { filename: string }) => r.filename));
}

async function applyMigration(filename: string, sql: string): Promise<void> {
  await db.transaction(async (trx) => {
    await trx.raw(sql);
    await trx(META_TABLE).insert({ filename });
  });
}

export async function runMigrations(): Promise<void> {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  if (files.length === 0) {
    logger.warn("No SQL migration files found");
    return;
  }

  const applied = await getAppliedMigrations();

  for (const file of files) {
    if (applied.has(file)) {
      logger.debug({ migration: file }, "Migration already applied, skipping");
      continue;
    }

    const sql = readFileSync(resolve(MIGRATIONS_DIR, file), "utf-8");
    logger.info({ migration: file }, "Applying migration");
    await applyMigration(file, sql);
    logger.info({ migration: file }, "Migration applied");
  }

  logger.info("All migrations up to date");
}
