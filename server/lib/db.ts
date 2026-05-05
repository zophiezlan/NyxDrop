import { neon, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "../../shared/schema.js";

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL is not set. Copy .env.example to .env and fill it in, " +
      "or set the env var in your deployment.",
  );
}

// Edge-friendly fetch transport. The serverless driver uses HTTP for queries,
// avoiding connection-pool churn on short-lived processes.
neonConfig.fetchConnectionCache = true;

const sql = neon(process.env.DATABASE_URL);

export const db = drizzle(sql, { schema });
export { schema };
