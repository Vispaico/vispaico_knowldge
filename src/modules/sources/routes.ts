import type { FastifyInstance } from "fastify";
import { createWebsiteSourceSchema } from "./schema.js";
import * as service from "./service.js";

export async function sourceRoutes(app: FastifyInstance) {
  app.post("/sources/website", {
    schema: {
      body: {
        type: "object",
        required: ["workspace_id", "name", "base_url"],
        properties: {
          workspace_id: { type: "string", format: "uuid" },
          name: { type: "string" },
          base_url: { type: "string", format: "uri" },
          metadata: { type: "object" },
        },
      },
    },
    handler: async (request, reply) => {
      const parseResult = createWebsiteSourceSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid request body",
            details: parseResult.error.flatten(),
          },
        });
      }

      const source = await service.createWebsiteSource(parseResult.data);
      return reply.status(201).send(source);
    },
  });

  app.get("/sources/:id", {
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
      const source = await service.getSource(id);
      return reply.send(source);
    },
  });
}
