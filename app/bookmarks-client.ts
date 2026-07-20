import type {
  Bookmark,
  LegacyBookmarkImportEntry,
} from "../lib/contracts";

export const LEGACY_BOOKMARKS_STORAGE_KEY = "curiositypedia:bookmarked-turns";

type LegacyStorage = Pick<Storage, "getItem" | "removeItem">;

export function parseLegacyBookmarks(raw: string): LegacyBookmarkImportEntry[] {
  let value: unknown;
  try {
    value = JSON.parse(raw) as unknown;
  } catch {
    return [];
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const entries: LegacyBookmarkImportEntry[] = [];
  const latestPlausibleSave = Date.now() + 5 * 60 * 1000;
  for (const [key, savedAt] of Object.entries(value)) {
    const separator = key.indexOf("::");
    if (separator < 8 || separator !== key.lastIndexOf("::")) continue;
    const journeyId = key.slice(0, separator);
    const turnId = key.slice(separator + 2);
    if (
      turnId.length < 8
      || journeyId.length > 100
      || turnId.length > 100
      || typeof savedAt !== "number"
      || !Number.isSafeInteger(savedAt)
      || savedAt < 1
      || savedAt > latestPlausibleSave
    ) continue;
    entries.push({ journeyId, turnId, savedAt });
  }
  return entries;
}

export async function migrateLegacyBookmarks(
  storage: LegacyStorage,
  importEntries: (entries: LegacyBookmarkImportEntry[]) => Promise<Bookmark[]>,
): Promise<Bookmark[] | null> {
  const raw = storage.getItem(LEGACY_BOOKMARKS_STORAGE_KEY);
  if (raw === null) return null;
  const bookmarks = await importEntries(parseLegacyBookmarks(raw));
  storage.removeItem(LEGACY_BOOKMARKS_STORAGE_KEY);
  return bookmarks;
}
