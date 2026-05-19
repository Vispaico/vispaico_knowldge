import { getEnv } from "./config/env.js";
import { logger } from "./lib/logger.js";
import { checkDbConnection, closeDb } from "./lib/db.js";
import { checkRedisConnection, closeRedis } from "./lib/redis.js";
import { runMigrations } from "./lib/migrate.js";
import { buildApp } from "./app.js";

async function main() {
  const env = getEnv();

  logger.info({ env: env.NODE_ENV }, "Starting knowledge-api");

  const dbOk = await checkDbConnection();
  if (!dbOk) {
    logger.error("Database connection failed, exiting");
    process.exit(1);
  }

  await runMigrations();

  const redisOk = await checkRedisConnection();
  if (!redisOk) {
    logger.warn("Redis connection failed, continuing without Redis");
  }

  const app = await buildApp();

  try {
    await app.listen({ port: env.PORT, host: env.HOST });
    logger.info({ port: env.PORT, host: env.HOST }, "Server listening");
  } catch (err) {
    logger.error({ err }, "Failed to start server");
    process.exit(1);
  }

  const shutdown = async (signal: string) => {
    logger.info({ signal }, "Shutting down");
    await app.close();
    await closeDb();
    await closeRedis();
    process.exit(0);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main();
