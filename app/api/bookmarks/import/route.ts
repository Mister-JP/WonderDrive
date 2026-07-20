import { mutation, readJson } from "../../../../lib/api";
import { importBookmarks } from "../../../../lib/bookmarks-repository";
import type { ImportBookmarksRequest } from "../../../../lib/contracts";

export async function POST(request: Request) {
  return mutation(request, async (viewer) => (
    importBookmarks(viewer, await readJson<ImportBookmarksRequest>(request))
  ));
}
