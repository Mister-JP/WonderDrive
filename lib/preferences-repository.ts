import { getD1 } from "../db";
import { BOOTSTRAP_CATALOG, DEFAULT_PREFERENCES } from "./catalog";
import type { UserPreferences } from "./contracts";
import { RepositoryError } from "./errors";
import { normalizeLocale } from "./i18n";
import { asRecord } from "./request";
import type { ViewerContext } from "./viewer";

type PreferencesRow = {
  interface_locale: UserPreferences["interfaceLocale"];
  default_output_locale: UserPreferences["defaultOutputLocale"];
  default_model_id: UserPreferences["defaultModelId"];
  answer_density: UserPreferences["answerDensity"];
  text_size: UserPreferences["textSize"];
  reduce_motion: number;
};

export async function getPreferences(viewer: ViewerContext): Promise<UserPreferences> {
  const row = await getD1()
    .prepare(
      `SELECT interface_locale, default_output_locale, default_model_id, answer_density, text_size,
              reduce_motion
       FROM preferences WHERE identity_id = ? LIMIT 1`,
    )
    .bind(viewer.identityId)
    .first<PreferencesRow>();
  return row
      ? {
        interfaceLocale: row.interface_locale,
        defaultOutputLocale: row.default_output_locale,
        defaultModelId: row.default_model_id,
        answerDensity: row.answer_density,
        textSize: row.text_size,
        reduceMotion: Boolean(row.reduce_motion),
      }
    : DEFAULT_PREFERENCES;
}

export async function updatePreferences(
  viewer: ViewerContext,
  value: unknown,
): Promise<UserPreferences> {
  const preferences = validatePreferences(value);
  await getD1()
    .prepare(
      `INSERT INTO preferences
        (identity_id, interface_locale, default_output_locale, default_model_id, answer_density, text_size,
         image_preference, reduce_motion, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(identity_id) DO UPDATE SET
         interface_locale = excluded.interface_locale,
         default_output_locale = excluded.default_output_locale,
         default_model_id = excluded.default_model_id,
         answer_density = excluded.answer_density,
         text_size = excluded.text_size,
         image_preference = excluded.image_preference,
         reduce_motion = excluded.reduce_motion,
         updated_at = excluded.updated_at`,
    )
    .bind(
      viewer.identityId,
      preferences.interfaceLocale,
      preferences.defaultOutputLocale,
      preferences.defaultModelId,
      preferences.answerDensity,
      preferences.textSize,
      "prefer",
      preferences.reduceMotion ? 1 : 0,
      Date.now(),
    )
    .run();
  return preferences;
}

function validatePreferences(value: unknown): UserPreferences {
  const body = asRecord(value);
  const interfaceLocale = normalizeLocale(body.interfaceLocale, "interface language");
  const defaultOutputLocale = normalizeLocale(body.defaultOutputLocale, "learning language");
  const defaultModelId = String(body.defaultModelId);
  const answerDensity = body.answerDensity;
  const textSize = body.textSize;
  const reduceMotion = body.reduceMotion;
  if (!BOOTSTRAP_CATALOG.models.some((model) => model.id === defaultModelId)) {
    throw new RepositoryError("BAD_REQUEST", "Choose a supported default model.", 400);
  }
  if (!["brief", "balanced", "rich"].includes(String(answerDensity))) {
    throw new RepositoryError("BAD_REQUEST", "Choose a supported answer density.", 400);
  }
  if (!["s", "m", "l", "xl"].includes(String(textSize))) {
    throw new RepositoryError("BAD_REQUEST", "Choose a supported text size.", 400);
  }
  if (typeof reduceMotion !== "boolean") {
    throw new RepositoryError("BAD_REQUEST", "Reduced motion must be true or false.", 400);
  }
  return {
    interfaceLocale,
    defaultOutputLocale,
    defaultModelId: defaultModelId as UserPreferences["defaultModelId"],
    answerDensity: answerDensity as UserPreferences["answerDensity"],
    textSize: textSize as UserPreferences["textSize"],
    reduceMotion,
  };
}
