import { z } from "zod";

export const websiteCrawlSchema = z.object({
  workspace_id: z.string().uuid(),
  source_id: z.string().uuid(),
  config: z
    .object({
      max_pages: z.number().int().positive().optional(),
      exclude_paths: z.array(z.string()).optional(),
      include_paths: z.array(z.string()).optional(),
    })
    .optional()
    .default({}),
});
