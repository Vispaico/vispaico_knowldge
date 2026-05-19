import pino from "pino";
import { getEnv } from "../config/env.js";

const env = getEnv();

export const logger = pino({
  level: env.LOG_LEVEL,
  ...(env.NODE_ENV === "development"
    ? { transport: { target: "pino-pretty", options: { colorize: true } } }
    : {}),
});
