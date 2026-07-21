import type { SupportedLocale } from "./contracts";
import { RepositoryError } from "./errors";

export const SUPPORTED_LOCALES = [
  { id: "en", name: "English", direction: "ltr" },
  { id: "es", name: "Español", direction: "ltr" },
  { id: "fr", name: "Français", direction: "ltr" },
  { id: "de", name: "Deutsch", direction: "ltr" },
  { id: "pt", name: "Português", direction: "ltr" },
  { id: "hi", name: "हिन्दी", direction: "ltr" },
  { id: "bn", name: "বাংলা", direction: "ltr" },
  { id: "ar", name: "العربية", direction: "rtl" },
  { id: "zh-CN", name: "简体中文", direction: "ltr" },
  { id: "ja", name: "日本語", direction: "ltr" },
  { id: "ko", name: "한국어", direction: "ltr" },
] as const satisfies ReadonlyArray<{
  id: SupportedLocale;
  name: string;
  direction: "ltr" | "rtl";
}>;

const localeIds = new Set<string>(SUPPORTED_LOCALES.map(({ id }) => id));

function isSupportedLocale(value: unknown): value is SupportedLocale {
  if (typeof value !== "string") return false;
  try {
    return localeIds.has(Intl.getCanonicalLocales(value)[0]);
  } catch {
    return false;
  }
}

export function normalizeLocale(value: unknown, label = "language"): SupportedLocale {
  if (!isSupportedLocale(value)) {
    throw new RepositoryError("BAD_REQUEST", `Choose a supported ${label}.`, 400);
  }
  return Intl.getCanonicalLocales(value)[0] as SupportedLocale;
}

export function localeName(locale: SupportedLocale): string {
  return SUPPORTED_LOCALES.find(({ id }) => id === locale)?.name ?? "English";
}

export function localeDirection(locale: SupportedLocale): "ltr" | "rtl" {
  return SUPPORTED_LOCALES.find(({ id }) => id === locale)?.direction ?? "ltr";
}

export function usesCompactWordSegmentation(locale: SupportedLocale): boolean {
  return locale === "zh-CN" || locale === "ja" || locale === "ko";
}
