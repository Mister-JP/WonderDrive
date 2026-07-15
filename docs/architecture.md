# WonderDrive V3 architecture decisions

Date: 2026-07-14
Status: final blueprint baseline
Supersedes: `ARCHITECTURE_DECISIONS.md` and the V2 Sites-guided blueprint

## Code change protocol

1. Read this document for invariants and boundaries.
2. Read the generated [code index](code-index.md) to find the existing owner and its direct local dependencies.
3. Change the smallest cohesive module; prefer shared boundary helpers over a second implementation.
4. Run `npm run architecture:update` whenever a file or local import changes.
5. Run `npm run architecture:check`, lint, type checking, and tests. CI enforces the index, and TypeScript rejects unused locals and parameters.

The runtime dependency direction is intentionally simple:

```text
React experience → API routes → domain/provider/repository modules → D1 or OpenAI
                         ↘ shared contracts, validation, and public errors ↗
```

- `app/client-api.ts` owns browser transport; `app/wonderdrive-experience.tsx` owns view orchestration and presentation.
- `lib/api.ts` owns HTTP boundaries; routes should contain only parameter extraction and use-case selection.
- `lib/repository.ts` owns deterministic journey mutations; `lib/live-repository.ts` owns live reservation and atomic commit.
- `lib/live-research.ts`, `lib/live-redraw.ts`, and `lib/starter-recommendations.ts` own distinct provider use cases, share `lib/openai.ts`, and write one call-level analytics record through `lib/provider-usage.ts` for every provider outcome.
- `lib/request.ts`, `lib/errors.ts`, and `lib/turn-options.ts` are narrow shared boundaries. They must not import product repositories.
- `db/schema.ts` is the desired schema; `drizzle/` is immutable migration history. Backward-compatible readers stay until deployed data is migrated deliberately.

## Current implementation status

The diagrams and runtime descriptions below document the checked-in implementation, not a hypothetical target:

- ChatGPT Sites hosts the Vinext application, server routes, public URL, identity seam, and server-only configuration.
- `worker/index.ts` is the packaged Vinext application entry point used by the Sites build; it is not a separately operated custom backend.
- OpenAI Responses is the only enabled live research provider. The same model selected for a turn performs its research, synthesis, and structured output.
- Sites-managed D1, exposed as the `DB` binding, is the canonical database. Repositories use prepared SQL and D1 batch writes against the schema in `db/schema.ts`.
- Drizzle SQL in `drizzle/` is packaged with `.openai/hosting.json` and applied through the Sites release path.
- Provider-call analytics cover live research, citation repair and recovery, starter generation, and live question redraws in `provider_usage_events`.
- R2, Supabase, queues, schedulers, background continuation, and provider fan-out are not provisioned in the current build.

## Architecture views

These four boards separate system context, runtime behavior, application ownership, and deployment so each view can be read independently. Every image has an editable Excalidraw source beside it in `design/`.

### 1. System landscape

The browser interacts only with WonderDrive on ChatGPT Sites. Sites routes call OpenAI for live provider work and read or write the Sites-managed D1 binding.

![WonderDrive system landscape](../design/wonderdrive-architecture-01-system-landscape.png)

[Edit the system-landscape board](../design/wonderdrive-architecture-01-system-landscape.excalidraw)

### 2. One foreground research turn

Time moves downward. The server resolves identity and ownership, reserves an idempotent foreground request, calls the selected OpenAI model, validates the sourced draft, commits all durable records in D1, and only then reveals the completed turn. A disconnect, provider error, invalid citation, or version race creates no turn.

![WonderDrive foreground research sequence](../design/wonderdrive-architecture-02-research-turn.png)

[Edit the research-turn board](../design/wonderdrive-architecture-02-research-turn.excalidraw)

### 3. Inside WonderDrive

The browser transport, API and identity boundary, live research service, journey service, D1 persistence adapter, OpenAI transport, and canonical D1 data groups have distinct owners. Ordinary journey management can bypass live research; both use-case paths persist through the D1 repository boundary.

![WonderDrive internal components](../design/wonderdrive-architecture-03-inside-wonderdrive.png)

[Edit the internal-components board](../design/wonderdrive-architecture-03-inside-wonderdrive.excalidraw)

### 4. Deployment topology

GitHub Actions verifies the architecture index, lint, types, production build, rendered shell, fixtures, and provider adapters. A reviewed Sites release contains the Vinext application plus packaged hosting metadata and Drizzle migrations. Sites injects server configuration, exposes the D1 binding, and makes server-to-server OpenAI requests.

![WonderDrive deployment topology](../design/wonderdrive-architecture-04-deployment-topology.png)

[Edit the deployment board](../design/wonderdrive-architecture-04-deployment-topology.excalidraw)

## Product decision

WonderDrive is an audience-directed curiosity performance. The audience selects a performer/model and a seed. The model selected for each turn researches the current question with bounded web tools, synthesizes a sourced answer in a distinct but restrained voice, and offers exactly two earned next questions. The audience may switch models between turns. The user chooses, rejects both, delegates the single choice, or leaves. Nothing advances invisibly.

The product is a journey graph, not a chat transcript and not a course with a completion screen. Saved runs can be resumed, branched, mapped, reflected on through snapshots, and compared manually. Comparison reads already-saved journeys; it never launches parallel provider work.

## Hosting and identity

- Ship one public OpenAI Site with a production URL. A custom domain is optional.
- Use Sites server routes for normal API work, provider secrets, authorization, context assembly, foreground research, validation, persistence, and SSE.
- Use Sites D1 as the single canonical database for the hackathon build. R2 is optional only for licensed factual media or generated decorative assets that are permitted to be cached.
- Use bounded guest play for immediate trial and dispatch-owned Sign in with ChatGPT for durable cross-device ownership.
- Persist the normalized email address and optional full name forwarded by SIWC for signed-in identities, refresh them on each visit, and never attach those fields to guest identities.
- Treat SIWC as identity, not workspace membership. Verify public sharing and external-user behavior in Gate 0.
- If non-ChatGPT accounts become mandatory, use Supabase social OAuth plus Postgres/RLS as the fallback. Do not promise arbitrary public email/password or magic-link signup on the current Supabase default SMTP; production email requires custom SMTP, redirect, recovery, abuse, and deliverability work.
- Add a separate Cloudflare Worker only after a measured Sites blocker. It is not part of the default V1 architecture.

## Research turn

Every turn is one bounded foreground operation:

1. Authenticate/authorize and reserve one idempotent run.
2. Assemble the compact context packet server-side.
3. Call the selected provider/model with web research tools and a hard budget.
4. Stream normalized observable research events; never expose hidden chain-of-thought.
5. Normalize consulted/cited sources, provider usage, search/fetch counts, and provider request IDs.
6. Validate the exact `TurnDraft` contract, safety, citations, and exactly-two invariant.
7. Commit the turn, options, handoff, sources, graph edge, and usage ledger atomically.
8. Reveal only committed content. Stop until another explicit audience action.

No scheduler, queue, workflow engine, background continuation, automatic journey, or provider fan-out is required for the hackathon.

## Context contract

The browser sends IDs and an action, never a model-ready transcript. The server assembles:

- stable performer/trust/schema instructions;
- exact provider/model/config and capability snapshot;
- seed, current question, action, branch depth, and requested preset;
- a compact recent topic/action trail;
- the immediate bridge turn when useful;
- a research handoff of confirmed discoveries, uncertainty, unresolved threads, useful source leads, and a topic label;
- rejection, unchosen, delegated, and reconnection signals selected for relevance;
- audience density, factual-image, read-aloud, accessibility, and adventure/grounding preferences;
- hard search, fetch, retrieved-token, output-token, wall-time, and dollar ceilings.

Exclude full transcripts, copied pages, irrelevant old branches, secrets, PII, raw provider envelopes, and private reasoning.

## Provider strategy

- P0: OpenAI Responses API with built-in web search, Structured Outputs, SSE, source inclusion, exact pinned model/config, and `store: false`.
- Second adapter: Gemini Interactions API with `google_search`, optional URL Context, observable steps, SSE, and schema output.
- Later, only after conformance: Claude Messages or xAI Responses.
- Keep Mistral Conversations and Perplexity Agent API as documented adapter seams, not mandatory hackathon scope.
- Every enabled adapter must map into the same canonical turn, research-event, source, usage, error, and cost contracts.
- The model explicitly selected for that turn researches and performs. Do not silently use a second model, planner, critic, or summarizer.
- Personalized starter sets are cached by identity, performer, and ordered topic-history hash for 24 hours. Normal landing and performer selection honor that cache; only an explicit audience refresh bypasses it, and a successful refresh replaces the cached set.

## Experience invariants

1. The journey screen stays mounted while research is pending. The answer card, image, evidence row, and two path positions show content-shaped buffering placeholders; no intermediate research-steps page is rendered.
2. A ready turn keeps the main journey concise: one contained short-answer card, an optional sourced image, a highlighted conclusion, and one evidence row. The complete answer, sources, research summary, and metadata open in a dismissible deeper-dive overlay.
3. The answer includes usable inline citations and consulted-versus-cited evidence.
4. Exactly two distinct next questions appear after every ready turn.
5. Reject Both regenerates one replacement pair using temporary practical, surprising, or different-direction feedback and does not create a new branch.
6. Factual visuals are real, sourced, captioned, and provenance-aware. Generated images are decorative and labeled.
7. The canonical displayed answer is the canonical read-aloud text. Browser speech is acceptable for P0.
8. Graph, status, action, and comparison meaning never depend on color alone; the map has a list equivalent.
9. Failure never creates a phantom node or advances the graph.

## Data and concurrency

Canonical D1 records cover users/guests, preferences, performer cues, model registry, prompt versions, journeys, turns, options, actions, edges, foreground research runs/events, sources and relations, committed-turn usage, provider-call usage analytics, idempotency keys, and snapshots. Legacy interlude tables remain in the schema only to prevent destructive migration of deployed databases.

- One active research run per journey/action.
- Idempotency key plus optimistic journey version prevents duplicate turns and two-tab races.
- A ready turn has exactly two current options.
- A selected action creates at most one child edge.
- Source URLs accepted into citations must belong to the normalized provider-returned source set.
- Turn, source, action, handoff, and usage rows commit together.

## Cost posture

The hackathon can begin with no custom domain and no separate fixed backend bill inside the owner's Sites/storage entitlements and allowances. This is not a guarantee of perpetual zero cost. AI tokens, reasoning tokens, web searches, URL fetches, retries, speech/media providers, and future infrastructure are metered or quota-bound.

Cost is calculated from actual provider-call usage dimensions and a dated rate snapshot—not from a fixed 1,000-input/350-output guess. `provider_usage_events` records the operation, purpose, outcome, model, provider IDs, token dimensions, searches, fetches, latency, estimated cost, safe categorical metadata, and failure reason for research, repair, recovery, starter generation, and redraw calls. Rolling project and identity budgets use this all-provider ledger, while `usage_events` remains the atomic committed-turn ledger. Enforce per-request, per-user/guest, per-provider/model, and project-wide budgets with alerts, hard stops, concurrency limits, and emergency key disable.

## Verification gates

Before product work depends on an assumption, the target account must prove:

- public-link access in a private window;
- SIWC identity and sign-out behavior for external users;
- D1 migrations, prepared statements, ownership, and restore rehearsal;
- provider secrets absent from bundles/logs;
- a 60–120 second SSE research request survives and reconnects coherently;
- saved-version review and production deploy behavior;
- exact model IDs, provider tool versions, pricing, quota, and plan entitlement at release time.

The V3 DOCX is the authoritative product and engineering blueprint. `V3_RESEARCH_NOTES.md` is the supporting primary-source ledger.
