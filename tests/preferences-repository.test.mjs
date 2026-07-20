import assert from "node:assert/strict";
import test from "node:test";
import { env } from "cloudflare:workers";
import { DEFAULT_PREFERENCES } from "../lib/catalog.ts";
import { getPreferences, updatePreferences } from "../lib/preferences-repository.ts";

const viewer = {
  identityId: "identity-owner",
  mode: "chatgpt",
  displayName: "Owner",
  journeyLimit: 20,
};

function createScriptedD1({ row = null } = {}) {
  const calls = [];
  return {
    calls,
    prepare(sql) {
      const call = { sql, bindings: [], runCount: 0 };
      calls.push(call);
      return {
        bind(...bindings) {
          call.bindings = bindings;
          return this;
        },
        async first() {
          return row;
        },
        async run() {
          call.runCount += 1;
          return { meta: { changes: 1 } };
        },
      };
    },
  };
}

function normalizedSql(call) {
  return call.sql.replace(/\s+/g, " ").trim();
}

function validPreferences(changes = {}) {
  return {
    interfaceLocale: "fr",
    defaultOutputLocale: "zh-CN",
    defaultModelId: "gpt-5.6-luna",
    answerDensity: "rich",
    textSize: "xl",
    reduceMotion: true,
    ...changes,
  };
}

test("getPreferences preserves its identity-bound query and default fallback", async () => {
  const db = createScriptedD1();
  env.DB = db;

  assert.deepEqual(await getPreferences(viewer), DEFAULT_PREFERENCES);
  assert.equal(db.calls.length, 1);
  assert.match(
    normalizedSql(db.calls[0]),
    /^SELECT interface_locale, default_output_locale, default_model_id, answer_density, text_size, reduce_motion FROM preferences WHERE identity_id = \? LIMIT 1$/,
  );
  assert.deepEqual(db.calls[0].bindings, [viewer.identityId]);
});

test("getPreferences omits the retired image setting", async () => {
  const db = createScriptedD1({
    row: {
      interface_locale: "ar",
      default_output_locale: "de",
      default_model_id: "gpt-5.6-terra",
      answer_density: "brief",
      text_size: "s",
      reduce_motion: 2,
    },
  });
  env.DB = db;

  assert.deepEqual(await getPreferences(viewer), {
    interfaceLocale: "ar",
    defaultOutputLocale: "de",
    defaultModelId: "gpt-5.6-terra",
    answerDensity: "brief",
    textSize: "s",
    reduceMotion: true,
  });
});

test("updatePreferences preserves normalization and always persists the product image contract", async () => {
  const db = createScriptedD1();
  env.DB = db;
  const originalNow = Date.now;
  Date.now = () => 9876;
  try {
    assert.deepEqual(await updatePreferences(viewer, validPreferences({
      interfaceLocale: "FR",
      defaultOutputLocale: "zh-cn",
    })), {
      interfaceLocale: "fr",
      defaultOutputLocale: "zh-CN",
      defaultModelId: "gpt-5.6-luna",
      answerDensity: "rich",
      textSize: "xl",
      reduceMotion: true,
    });
  } finally {
    Date.now = originalNow;
  }

  assert.equal(db.calls.length, 1);
  assert.match(
    normalizedSql(db.calls[0]),
    /^INSERT INTO preferences \(identity_id, interface_locale, default_output_locale, default_model_id, answer_density, text_size, image_preference, reduce_motion, updated_at\) VALUES \(\?, \?, \?, \?, \?, \?, \?, \?, \?\) ON CONFLICT\(identity_id\) DO UPDATE SET interface_locale = excluded\.interface_locale, default_output_locale = excluded\.default_output_locale, default_model_id = excluded\.default_model_id, answer_density = excluded\.answer_density, text_size = excluded\.text_size, image_preference = excluded\.image_preference, reduce_motion = excluded\.reduce_motion, updated_at = excluded\.updated_at$/,
  );
  assert.deepEqual(db.calls[0].bindings, [
    viewer.identityId,
    "fr",
    "zh-CN",
    "gpt-5.6-luna",
    "rich",
    "xl",
    "prefer",
    1,
    9876,
  ]);
  assert.equal(db.calls[0].runCount, 1);
});

test("updatePreferences preserves validation errors before D1 access", async () => {
  const cases = [
    [{ ...validPreferences(), interfaceLocale: "xx" }, "Choose a supported interface language."],
    [{ ...validPreferences(), defaultOutputLocale: "xx" }, "Choose a supported learning language."],
    [{ ...validPreferences(), defaultModelId: "unsupported-model" }, "Choose a supported default model."],
    [{ ...validPreferences(), answerDensity: "exhaustive" }, "Choose a supported answer density."],
    [{ ...validPreferences(), textSize: "xxl" }, "Choose a supported text size."],
    [{ ...validPreferences(), reduceMotion: "yes" }, "Reduced motion must be true or false."],
  ];

  for (const [value, message] of cases) {
    const db = createScriptedD1();
    env.DB = db;
    await assert.rejects(
      () => updatePreferences(viewer, value),
      (error) => error?.code === "BAD_REQUEST"
        && error?.status === 400
        && error?.retryable === false
        && error?.message === message,
    );
    assert.equal(db.calls.length, 0);
  }
});
