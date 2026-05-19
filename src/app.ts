import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { getEnv } from "./config/env.js";
import { logger } from "./lib/logger.js";
import { healthRoutes } from "./modules/health/routes.js";
import { organizationRoutes } from "./modules/organizations/routes.js";
import { workspaceRoutes } from "./modules/workspaces/routes.js";
import { sourceRoutes } from "./modules/sources/routes.js";
import { ingestionRoutes } from "./modules/ingestion/routes.js";
import { documentRoutes } from "./modules/documents/routes.js";
import { searchRoutes } from "./modules/search/routes.js";
import { retrieveRoutes } from "./modules/retrieve/routes.js";
import { agentRoutes } from "./modules/agent/routes.js";

export async function buildApp() {
  const env = getEnv();

  const app = Fastify({
    logger: env.NODE_ENV === "production",
    disableRequestLogging: false,
  });

  await app.register(cors, {
    origin: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  });

  await app.register(helmet, {
    contentSecurityPolicy: false,
  });

  await app.register(rateLimit, {
    max: 100,
    timeWindow: "1 minute",
  });

  app.setErrorHandler((error, _request, reply) => {
    // Fastify error type and AppError don't share a hierarchy; check properties directly
    const err = error as Record<string, unknown>;

    const statusCode = (err.statusCode as number | undefined) ?? 500;
    const code = (err.code as string | undefined) ?? "INTERNAL_ERROR";
    const message = (err.message as string | undefined) ?? "An unexpected error occurred";
    const details = err.details ?? err.validation;

    if (statusCode === 500) {
      logger.error({ err: error }, "Unhandled error");
    }

    return reply.status(statusCode).send({
      error: { code, message, ...(details ? { details } : {}) },
    });
  });

  app.setNotFoundHandler((_request, reply) => {
    return reply.status(404).send({
      error: {
        code: "NOT_FOUND",
        message: "Route not found",
      },
    });
  });

  await app.register(healthRoutes);
  await app.register(organizationRoutes);
  await app.register(workspaceRoutes);
  await app.register(sourceRoutes);
  await app.register(ingestionRoutes);
  await app.register(documentRoutes);
  await app.register(searchRoutes);
  await app.register(retrieveRoutes);
  await app.register(agentRoutes);

  return app;
}
