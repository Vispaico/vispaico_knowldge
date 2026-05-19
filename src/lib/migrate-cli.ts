import { runMigrations } from "./migrate.js";
import { getEnv } from "../config/env.js";

getEnv();

runMigrations()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error("Migration failed:", err);
    process.exit(1);
  });
