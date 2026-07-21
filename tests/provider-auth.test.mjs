import assert from "node:assert/strict";
import test from "node:test";
import {
  OPENAI_API_KEY_HEADER,
  providerAuthFromRequest,
} from "../lib/provider-auth.ts";

test("uses application funding when no BYOK credential is supplied", () => {
  const auth = providerAuthFromRequest(new Request("https://example.test/api/research"));
  assert.deepEqual(auth, { funding: "application" });
});

test("accepts a well-formed ephemeral BYOK credential without returning it in errors", () => {
  const request = new Request("https://example.test/api/research", {
    headers: { [OPENAI_API_KEY_HEADER]: "sk-test-user-credential-long-enough" },
  });
  assert.deepEqual(providerAuthFromRequest(request), {
    funding: "user",
    apiKey: "sk-test-user-credential-long-enough",
  });

  const invalid = new Request("https://example.test/api/research", {
    headers: { [OPENAI_API_KEY_HEADER]: "not-a-secret" },
  });
  assert.throws(
    () => providerAuthFromRequest(invalid),
    (error) => error?.code === "BAD_REQUEST"
      && !error.message.includes("not-a-secret"),
  );
});
