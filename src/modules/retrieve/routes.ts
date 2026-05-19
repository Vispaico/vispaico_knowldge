import type { FastifyInstance } from "fastify";
import { retrieveSchema } from "./schema.js";
import * as service from "./service.js";

export async function retrieveRoutes(app: FastifyInstance) {
  app.post("/workspaces/:workspace_id/retrieve", {
    schema: {
      params: {
        type: "object",
        required: ["workspace_id"],
        properties: {
          workspace_id: { type: "string", format: "uuid" },
        },
      },
      body: {
        type: "object",
        required: ["query"],
        properties: {
          query: { type: "string" },
          limit: { type: "integer" },
        },
      },
    },
    handler: async (request, reply) => {
      const { workspace_id } = request.params as { workspace_id: string };

      const parseResult = retrieveSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid request body",
            details: parseResult.error.flatten(),
          },
        });
      }

      const result = await service.retrieveWorkspace(workspace_id, parseResult.data);
      return reply.send(result);
    },
  });
}
