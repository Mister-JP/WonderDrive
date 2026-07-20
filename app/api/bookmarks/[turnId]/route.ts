import { mutation } from "../../../../lib/api";
import { removeBookmark } from "../../../../lib/bookmarks-repository";

type Context = { params: Promise<{ turnId: string }> };

export async function DELETE(request: Request, context: Context) {
  return mutation(request, async (viewer) => {
    const { turnId } = await context.params;
    return removeBookmark(viewer, turnId);
  });
}
