import { z } from "zod";

export const createWorkspaceSchema = z.object({
  organization_id: z.string().uuid(),
  name: z.string().min(1).max(255),
  slug: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must be lowercase alphanumeric with optional hyphens"),
  description: z.string().max(1000).optional(),
});
