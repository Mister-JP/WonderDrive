import assert from "node:assert/strict";
import test from "node:test";
import { env } from "cloudflare:workers";
import {
  openAIConfigured,
  openAIEnabled,
  requestOpenAI,
  retrieveOpenAIResponse,
} from "../lib/openai.ts";

test("the emergency switch blocks every OpenAI transport call and configuration check", async () => {
  const originalFetch = globalThis.fetch;
  let providerCalls = 0;
  globalThis.fetch = async () => {
    providerCalls += 1;
    return new Response("{}", { status: 200 });
  };
  env.OPENAI_API_KEY = "test-key";

  try {
    for (const disabledValue of ["0", "false", "FALSE", "off", "disabled"]) {
      env.CURIOSITYPEDIA_OPENAI_ENABLED = disabledValue;
      assert.equal(openAIEnabled(), false);
      assert.equal(openAIConfigured(), false);
      assert.throws(
        () => requestOpenAI({ model: "gpt-5.6-luna" }),
        (error) => error?.code === "PROVIDER_UNAVAILABLE" && error?.status === 503,
      );
    }
    assert.equal(providerCalls, 0);

    for (const enabledValue of [undefined, "", "1", "true", "yes"]) {
      if (enabledValue === undefined) delete env.CURIOSITYPEDIA_OPENAI_ENABLED;
      else env.CURIOSITYPEDIA_OPENAI_ENABLED = enabledValue;
      assert.equal(openAIEnabled(), true);
      assert.equal(openAIConfigured(), true);
      const response = await requestOpenAI({ model: "gpt-5.6-luna", store: false });
      assert.equal(response.status, 200);
    }
    assert.equal(providerCalls, 5);
  } finally {
    globalThis.fetch = originalFetch;
    delete env.OPENAI_API_KEY;
    delete env.CURIOSITYPEDIA_OPENAI_ENABLED;
  }
});

test("stored response retrieval preserves requested web evidence expansions", async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl = null;
  globalThis.fetch = async (input) => {
    requestedUrl = new URL(input);
    return Response.json({ status: "completed" });
  };
  env.OPENAI_API_KEY = "test-key";

  try {
    await retrieveOpenAIResponse("resp_background_evidence", {
      include: ["web_search_call.action.sources", "web_search_call.results"],
    });
    assert.equal(requestedUrl.pathname, "/v1/responses/resp_background_evidence");
    assert.deepEqual(
      requestedUrl.searchParams.getAll("include[]"),
      ["web_search_call.action.sources", "web_search_call.results"],
    );
  } finally {
    globalThis.fetch = originalFetch;
    delete env.OPENAI_API_KEY;
  }
});

test("an ephemeral BYOK credential overrides the deployment credential without exposure", async () => {
  const originalFetch = globalThis.fetch;
  let authorization = null;
  globalThis.fetch = async (_input, init) => {
    authorization = new Headers(init?.headers).get("authorization");
    return Response.json({ status: "completed" });
  };
  env.OPENAI_API_KEY = "deployment-key";
  try {
    await requestOpenAI(
      { model: "gpt-5.4-nano" },
      { apiKey: "sk-user-ephemeral-key-long-enough" },
    );
    assert.equal(authorization, "Bearer sk-user-ephemeral-key-long-enough");
  } finally {
    globalThis.fetch = originalFetch;
    delete env.OPENAI_API_KEY;
  }
});
