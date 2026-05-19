import type { Knex } from "knex";

const config: Knex.Config = {
  client: "pg",
  connection: process.env.DATABASE_URL ?? "postgresql://knowledge:knowledge@localhost:5432/knowledge",
  migrations: {
    directory: "./migrations",
    extension: "sql",
  },
  pool: {
    min: 2,
    max: 10,
  },
};

export default config;
