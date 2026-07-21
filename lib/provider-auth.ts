import { RepositoryError } from "./errors";

export const OPENAI_API_KEY_HEADER = "x-curiositypedia-openai-key";

export type ProviderAuth =
  | { funding: "application"; apiKey?: undefined }
  | { funding: "user"; apiKey: string };

export const APPLICATION_PROVIDER_AUTH: ProviderAuth = Object.freeze({
  funding: "application",
});

/**
 * Reads an ephemeral BYOK credential from a same-origin request. The value is
 * deliberately never persisted, returned to the client, or included in errors.
 */
export function providerAuthFromRequest(request: Request): ProviderAuth {
  const apiKey = request.headers.get(OPENAI_API_KEY_HEADER)?.trim();
  if (!apiKey) return APPLICATION_PROVIDER_AUTH;
  if (
    apiKey.length < 20
    || apiKey.length > 512
    || !apiKey.startsWith("sk-")
    || /[\s\u0000-\u001f\u007f]/.test(apiKey)
  ) {
    throw new RepositoryError(
      "BAD_REQUEST",
      "The supplied OpenAI API key does not have a valid format.",
      400,
    );
  }
  return { funding: "user", apiKey };
}
