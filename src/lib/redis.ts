import Redis from "ioredis";
import { getEnv } from "../config/env.js";
import { logger } from "./logger.js";

let redis: Redis | null = null;

export function getRedis(): Redis {
  if (!redis) {
    const env = getEnv();
    redis = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    });

    redis.on("connect", () => logger.info("Redis connected"));
    redis.on("error", (err) => logger.error({ err }, "Redis error"));
  }
  return redis;
}

export async function checkRedisConnection(): Promise<boolean> {
  try {
    const r = getRedis();
    await r.ping();
    return true;
  } catch (err) {
    logger.error({ err }, "Redis connection failed");
    return false;
  }
}

export async function closeRedis(): Promise<void> {
  if (redis) {
    await redis.quit();
    redis = null;
  }
}
