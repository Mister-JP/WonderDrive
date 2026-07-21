import { env } from "cloudflare:workers";
import { mutation, query, readJson } from "../../../lib/api";
import { RepositoryError } from "../../../lib/errors";
import {
  getLandingRecommendationPage,
  publishLandingRecommendationBatch,
  type PublishLandingBatchInput,
} from "../../../lib/landing-recommendations-repository";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const searchParams = new URL(request.url).searchParams;
  const requestedPage = Number(searchParams.get("page") ?? "1");
  return query(() => getLandingRecommendationPage(requestedPage, searchParams.get("category")));
}

export async function POST(request: Request) {
  return mutation(request, async () => {
    await assertEditorAuthorization(request);
    return publishLandingRecommendationBatch(await readJson<PublishLandingBatchInput>(request));
  }, 201);
}

async function assertEditorAuthorization(request: Request) {
  const configuredKey = env.EDITOR_API_KEY?.trim();
  const providedKey = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!configuredKey || !providedKey || !(await equalSecrets(configuredKey, providedKey))) {
    throw new RepositoryError("FORBIDDEN", "A valid editor API key is required.", 403);
  }
}

async function equalSecrets(left: string, right: string) {
  const encoder = new TextEncoder();
  const [leftDigest, rightDigest] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(left)),
    crypto.subtle.digest("SHA-256", encoder.encode(right)),
  ]);
  const leftBytes = new Uint8Array(leftDigest);
  const rightBytes = new Uint8Array(rightDigest);
  let difference = leftBytes.length ^ rightBytes.length;
  for (let index = 0; index < leftBytes.length; index += 1) {
    difference |= leftBytes[index] ^ (rightBytes[index] ?? 0);
  }
  return difference === 0;
}
