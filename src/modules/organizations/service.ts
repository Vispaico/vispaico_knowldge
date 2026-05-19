import { ConflictError } from "../../lib/errors.js";
import type { Organization } from "../../types/index.js";
import * as repo from "./repository.js";

export async function createOrganization(data: {
  name: string;
  slug: string;
}): Promise<Organization> {
  const existing = await repo.findOrganizationBySlug(data.slug);
  if (existing) {
    throw new ConflictError(`Organization with slug '${data.slug}' already exists`);
  }
  return repo.createOrganization(data);
}
