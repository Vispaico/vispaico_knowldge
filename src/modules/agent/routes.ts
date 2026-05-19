import type { FastifyInstance } from "fastify";
import { agentChatSchema } from "./schema.js";
import * as service from "./service.js";

export async function agentRoutes(app: FastifyInstance) {
  app.post("/workspaces/:workspace_id/agent/chat", {
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
        required: ["message"],
        properties: {
          message: { type: "string" },
        },
      },
    },
    handler: async (request, reply) => {
      const { workspace_id } = request.params as { workspace_id: string };

      const parseResult = agentChatSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid request body",
            details: parseResult.error.flatten(),
          },
        });
      }

      const result = await service.agentChat(workspace_id, parseResult.data);
      return reply.send(result);
    },
  });
}
