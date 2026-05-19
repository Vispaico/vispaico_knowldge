import knexLib from "knex";
import { getEnv } from "../config/env.js";
import { logger } from "./logger.js";

const env = getEnv();

export const db = knexLib({
  client: "pg",
  connection: env.DATABASE_URL,
  pool: { min: 2, max: 10 },
});

export async function checkDbConnection(): Promise<boolean> {
  try {
    await db.raw("SELECT 1");
    logger.info("PostgreSQL connected");
    return true;
  } catch (err) {
    logger.error({ err }, "PostgreSQL connection failed");
    return false;
  }
}

export async function closeDb(): Promise<void> {
  await db.destroy();
}
