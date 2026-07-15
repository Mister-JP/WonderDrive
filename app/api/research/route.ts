import { assertMutationOrigin, failure, readJson } from "../../../lib/api";
import type {
  LiveResearchRequest,
  LiveResearchStreamEvent,
} from "../../../lib/contracts";
import {
  commitLiveResearch,
  markLiveResearchFailed,
  prepareLiveResearch,
} from "../../../lib/live-repository";
import { runLiveResearch } from "../../../lib/live-research";
import { publicError } from "../../../lib/errors";
import { publicViewer, resolveViewer } from "../../../lib/viewer";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    assertMutationOrigin(request);
    const viewer = await resolveViewer();
    const body = (await readJson(request)) as LiveResearchRequest;
    const preparation = await prepareLiveResearch(viewer, body);
    const encoder = new TextEncoder();
    const abortController = new AbortController();
    let closed = false;

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const send = (event: LiveResearchStreamEvent) => {
          if (!closed) {
            const name = event.type;
            controller.enqueue(encoder.encode(`event: ${name}\ndata: ${JSON.stringify(event)}\n\n`));
          }
        };
        void (async () => {
          const requestId =
            preparation.type === "ready" ? preparation.prepared.requestId : preparation.requestId;
          const question =
            preparation.type === "ready"
              ? preparation.prepared.question
              : preparation.journey.turns.at(-1)?.question ?? preparation.journey.seed;
          send({
            type: "started",
            requestId,
            question,
            message:
              preparation.type === "replay"
                ? "Returning the already committed result for this request"
                : "Foreground research started; keep this page open",
          });
          const heartbeat = setInterval(() => send({ type: "heartbeat", at: Date.now() }), 12_000);
          if (preparation.type === "replay") {
            send({
              type: "complete",
              data: preparation.journey,
              viewer: publicViewer(viewer),
            });
            closed = true;
            clearInterval(heartbeat);
            controller.close();
            return;
          }
          try {
            const draft = await runLiveResearch(
              preparation.prepared,
              (event) => send({ type: "activity", event }),
              abortController.signal,
            );
            const journey = await commitLiveResearch(viewer, preparation.prepared, draft);
            send({ type: "complete", data: journey, viewer: publicViewer(viewer) });
          } catch (error) {
            await markLiveResearchFailed(viewer, preparation.prepared.requestId, error);
            if (!closed) {
              send({
                type: "error",
                error: {
                  ...publicError(
                    error,
                    "WonderDrive could not complete live research. No partial journey was saved.",
                  ),
                  diagnosticId: preparation.prepared.requestId,
                },
              });
            }
          } finally {
            clearInterval(heartbeat);
            if (!closed) {
              closed = true;
              controller.close();
            }
          }
        })();
      },
      cancel() {
        closed = true;
        abortController.abort("Client disconnected from foreground research");
      },
    });

    const headers = new Headers({
      "cache-control": "no-store, no-transform",
      connection: "keep-alive",
      "content-type": "text/event-stream; charset=utf-8",
      "x-content-type-options": "nosniff",
    });
    if (viewer.setCookie) headers.append("set-cookie", viewer.setCookie);
    return new Response(stream, { status: 200, headers });
  } catch (error) {
    return failure(error);
  }
}
