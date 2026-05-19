import type { FastifyInstance } from "fastify";
import { websiteCrawlSchema } from "./schema.js";
import * as service from "./service.js";

export async function ingestionRoutes(app: FastifyInstance) {
  app.post("/ingestion/website-crawl", {
    schema: {
      body: {
        type: "object",
        required: ["workspace_id", "source_id"],
        properties: {
          workspace_id: { type: "string", format: "uuid" },
          source_id: { type: "string", format: "uuid" },
          config: { type: "object" },
        },
      },
    },
    handler: async (request, reply) => {
      const parseResult = websiteCrawlSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid request body",
            details: parseResult.error.flatten(),
          },
        });
      }

      const job = await service.triggerWebsiteCrawl(parseResult.data);
      return reply.status(201).send(job);
    },
  });

  app.get("/ingestion/jobs/:id", {
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
      const job = await service.getIngestionJob(id);
      return reply.send(job);
    },
  });
}
