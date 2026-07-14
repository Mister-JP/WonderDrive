import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

/* eslint-disable @typescript-eslint/no-namespace -- Cloudflare augments this namespace for bindings. */
declare global {
  namespace Cloudflare {
    interface Env {
      DB: D1Database;
    }
  }
}
/* eslint-enable @typescript-eslint/no-namespace */

export function getDb() {
  if (!env.DB) {
    throw new Error(
      "Cloudflare D1 binding `DB` is unavailable. Set the `d1` field in .openai/hosting.json to `DB` or let your control plane inject the real binding values before using the database."
    );
  }

  return drizzle(env.DB, { schema });
}

export function getD1(): D1Database {
  if (!env.DB) {
    throw new Error(
      "Cloudflare D1 binding `DB` is unavailable. Set the `d1` field in .openai/hosting.json to `DB`.",
    );
  }

  return env.DB;
}
