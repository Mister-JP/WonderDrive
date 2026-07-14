import { env } from "cloudflare:workers";

/* eslint-disable @typescript-eslint/no-namespace -- Cloudflare augments this namespace for bindings. */
declare global {
  namespace Cloudflare {
    interface Env {
      DB: D1Database;
    }
  }
}
/* eslint-enable @typescript-eslint/no-namespace */

export function getD1(): D1Database {
  if (!env.DB) {
    throw new Error(
      "Cloudflare D1 binding `DB` is unavailable. Set the `d1` field in .openai/hosting.json to `DB`.",
    );
  }

  return env.DB;
}
