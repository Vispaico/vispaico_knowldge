import type { FastifyInstance } from "fastify";
import { createWorkspaceSchema } from "./schema.js";
import * as service from "./service.js";

export async function workspaceRoutes(app: FastifyInstance) {
  app.post("/workspaces", {
    schema: {
      body: {
        type: "object",
        required: ["organization_id", "name", "slug"],
        properties: {
          organization_id: { type: "string", format: "uuid" },
          name: { type: "string" },
          slug: { type: "string" },
          description: { type: "string" },
        },
      },
    },
    handler: async (request, reply) => {
      const parseResult = createWorkspaceSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid request body",
            details: parseResult.error.flatten(),
          },
        });
      }

      const workspace = await service.createWorkspace(parseResult.data);
      return reply.status(201).send(workspace);
    },
  });
}
