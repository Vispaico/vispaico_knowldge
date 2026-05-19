import type { FastifyInstance } from "fastify";
import { getHealth } from "./service.js";

export async function healthRoutes(app: FastifyInstance) {
  app.get("/health", {
    schema: {
      response: {
        200: {
          type: "object",
          properties: {
            status: { type: "string" },
            timestamp: { type: "string" },
            version: { type: "string" },
          },
        },
      },
    },
    handler: async (_request, reply) => {
      return reply.send(getHealth());
    },
  });
}
