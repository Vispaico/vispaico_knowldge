import type { FastifyInstance } from "fastify";
import * as service from "./service.js";

export async function documentRoutes(app: FastifyInstance) {
  app.get("/sources/:id/documents", {
    schema: {
      params: {
        type: "object",
        required: ["id"],
        properties: {
          id: { type: "string", format: "uuid" },
        },
      },
    },
    handler: async (request, reply) => {
      const { id } = request.params as { id: string };
      const result = await service.getDocumentsBySource(id);
      return reply.send(result);
    },
  });

  app.get("/documents/:id", {
    schema: {
      params: {
        type: "object",
        required: ["id"],
        properties: {
          id: { type: "string", format: "uuid" },
        },
      },
    },
    handler: async (request, reply) => {
      const { id } = request.params as { id: string };
      const result = await service.getDocument(id);
      return reply.send(result);
    },
  });
}
