import { mutation, query, readJson } from "../../../lib/api";
import { addBookmark, listBookmarks } from "../../../lib/bookmarks-repository";
import type { AddBookmarkRequest } from "../../../lib/contracts";

export async function GET() {
  return query(listBookmarks);
}

export async function POST(request: Request) {
  return mutation(
    request,
    async (viewer) => addBookmark(viewer, await readJson<AddBookmarkRequest>(request)),
    201,
  );
}
