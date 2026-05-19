import { db } from "../../lib/db.js";
import type { Organization } from "../../types/index.js";

export async function createOrganization(data: {
  name: string;
  slug: string;
  metadata?: Record<string, unknown>;
}): Promise<Organization> {
  const [row] = await db("organizations")
    .insert({
      name: data.name,
      slug: data.slug,
      metadata: data.metadata ?? {},
    })
    .returning("*");

  return row;
}

export async function findOrganizationById(id: string): Promise<Organization | undefined> {
  return db("organizations").where({ id }).first();
}

export async function findOrganizationBySlug(slug: string): Promise<Organization | undefined> {
  return db("organizations").where({ slug }).first();
}
