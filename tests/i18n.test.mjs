import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { MODELS, PERFORMERS } from "../lib/catalog.ts";
import { hasTranslation, interfaceMessageKeys, translate } from "../app/i18n.tsx";
import { SUPPORTED_LOCALES, localeDirection, normalizeLocale, usesCompactWordSegmentation } from "../lib/i18n.ts";

test("every interface message has a complete locale catalog with matching placeholders", async () => {
  const interfaceSources = await Promise.all([
    "../app/curiositypedia-experience.tsx",
    "../app/experience/bookmarks-view.tsx",
    "../app/experience/empty-stage.tsx",
    "../app/experience/journey-map.tsx",
    "../app/experience/journeys-view.tsx",
    "../app/experience/settings-view.tsx",
    "../app/experience/usage-view.tsx",
  ].map((path) => readFile(new URL(path, import.meta.url), "utf8")));
  const keys = interfaceSources.flatMap((source) => [...source.matchAll(/\bt\(\s*"([^"]+)"/g)].map((match) => match[1]));
  const catalogKeys = [
    ...PERFORMERS.flatMap((performer) => [performer.role, performer.cue, ...performer.voiceTraits]),
    ...MODELS.map((model) => model.disclosure),
  ];
  const serverSource = await readFile(new URL("../lib/repository.ts", import.meta.url), "utf8");
  const serverKeys = [...serverSource.matchAll(/\{ key: "([^"]+)"/g)].map((match) => match[1]);
  const required = [...new Set([...interfaceMessageKeys, ...keys, ...catalogKeys, ...serverKeys])].sort();
  const localized = SUPPORTED_LOCALES.filter(({ id }) => id !== "en");
  for (const { id } of localized) {
    const missing = required.filter((key) => !hasTranslation(id, key));
    assert.deepEqual(missing, [], `${id} is missing interface messages`);
    for (const key of required) {
      const expected = [...key.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
      const actual = [...translate(id, key).matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
      assert.deepEqual(actual, expected, `${id} changed placeholders for ${key}`);
    }
  }
});

test("locale helpers validate, interpolate, and expose direction", () => {
  assert.deepEqual(
    SUPPORTED_LOCALES.map(({ id }) => id),
    ["en", "es", "fr", "de", "pt", "hi", "bn", "ar", "zh-CN", "ja", "ko"],
  );
  assert.equal(normalizeLocale("es"), "es");
  assert.equal(localeDirection("es"), "ltr");
  assert.equal(localeDirection("ar"), "rtl");
  assert.equal(normalizeLocale("zh-CN"), "zh-CN");
  assert.equal(usesCompactWordSegmentation("ja"), true);
  assert.equal(usesCompactWordSegmentation("hi"), false);
  assert.equal(translate("es", "Turn {number}", { number: 3 }), "Turno 3");
  assert.throws(() => normalizeLocale("xx-invalid"));
});
