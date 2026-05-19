import { z } from "zod";

export const createWebsiteSourceSchema = z.object({
  workspace_id: z.string().uuid(),
  name: z.string().min(1).max(255),
  base_url: z.string().url(),
  metadata: z.record(z.unknown()).optional().default({}),
});
