import type { FastifyInstance } from "fastify";
import { createOrganizationSchema } from "./schema.js";
import * as service from "./service.js";

export async function organizationRoutes(app: FastifyInstance) {
  app.post("/organizations", {
    schema: {
      body: {
        type: "object",
        required: ["name", "slug"],
        properties: {
          name: { type: "string" },
          slug: { type: "string" },
        },
      },
    },
    handler: async (request, reply) => {
      const parseResult = createOrganizationSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid request body",
            details: parseResult.error.flatten(),
          },
        });
      }

      const org = await service.createOrganization(parseResult.data);
      return reply.status(201).send(org);
    },
  });
}
