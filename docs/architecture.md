# Architecture

This document describes the current implementation on `main`.

## System boundary

CuriosityPedia is one Vinext application deployed through OpenAI Sites. It contains the React interface, server routes, OpenAI integration, and D1 persistence layer.

```text
Browser
  -> Vinext pages and API routes
      -> identity, validation, and domain services
          -> OpenAI Responses API
          -> Sites-managed D1
```

There is no queue service, scheduler, background worker, provider fan-out, R2 bucket, Supabase project, or separately deployed backend. New-journey research uses the Responses API's stored background mode and D1 status rows; follow-up turns remain bounded foreground requests.

## Module boundaries

| Area | Owner |
| --- | --- |
| Interface orchestration | `app/curiositypedia-experience.tsx` |
| Usage, journey-list, and bookmark presentation | `app/experience/usage-view.tsx`, `app/experience/journeys-view.tsx`, `app/experience/bookmarks-view.tsx` |
| Settings presentation | `app/experience/settings-view.tsx` |
| Shared empty-stage presentation | `app/experience/empty-stage.tsx` |
| Journey graph projection, paths, folding, and layout | `app/experience/journey-graph.ts` |
| Journey map rendering and map-local interaction state | `app/experience/journey-map.tsx` |
| Browser API transport | `app/client-api.ts` |
| One-time browser bookmark import | `app/bookmarks-client.ts` |
| Route parsing and URL generation | `app/routes.ts` |
| Localization provider and catalogs | `app/i18n.tsx`, `app/locales/`, `lib/i18n.ts` |
| HTTP parsing and public responses | `lib/api.ts`, `lib/errors.ts` |
| Shared request and response contracts | `lib/contracts.ts` |
| Owned journey reads and row-to-domain mapping | `lib/journeys/read-model.ts` |
| Deterministic journey mutations and journey repository facade | `lib/repository.ts` |
| Identity-scoped topic bookmark reads, writes, and legacy import | `lib/bookmarks-repository.ts` |
| Preference validation, defaults, reads, and writes | `lib/preferences-repository.ts` |
| Journey management validation and optimistic updates | `lib/journey-management-repository.ts` |
| Snapshot creation, listing, and journey export | `lib/snapshots-repository.ts` |
| Identity-bound observable research-request status | `lib/research-status-repository.ts` |
| Live reservation and atomic commit | `lib/live-repository.ts` |
| Research prompt, schema, density, and image-direction policy | `lib/research/prompt-policy.ts` |
| Provider envelope, source/image, URL, and usage-counter normalization | `lib/research/provider-response.ts` |
| Primary research provider stream invocation, SSE parsing, timeout/abort mechanics, transport diagnostics, and provider outcome recording | `lib/research/provider-stream.ts` |
| Generated-turn, evidence, media, handoff, option, and pure repair policy | `lib/research/turn-validation.ts` |
| Research workflow, request policy assembly, user-visible activity ordering, repair/recovery coordination, and aggregate usage/cost assembly | `lib/live-research.ts` |
| Replacement-question generation | `lib/live-redraw.ts` |
| Global landing recommendation archive and editorial publishing | `lib/landing-recommendations-repository.ts` |
| OpenAI request helpers | `lib/openai.ts` |
| Atomic provider-cost admission, reservation, and settlement | `lib/provider-cost-control.ts` |
| Current guest and ChatGPT user policy, model access, diagnostics, and usage summaries | `lib/usage-policy.ts`, `lib/provider-usage.ts`, `lib/usage-summary.ts` |
| Identity resolution | `app/chatgpt-auth.ts`, `lib/viewer.ts` |
| Database schema | `db/schema.ts` |

Dependencies flow from pages and routes into domain modules, then into D1 or OpenAI. Shared contracts and error helpers do not import repositories. The journey graph model is a pure interface-domain module: it imports only shared journey contracts and has no React, browser, routing, storage, network, clock, or random dependency. The journey read model owns identity-bound list/detail reads, rejected-question reads, legacy JSON fallbacks, and row-to-domain mapping. `lib/repository.ts` re-exports the public read surface and owns deterministic mutations. The journey-management repository owns management-input validation and the identity- and version-bound title, pin, and visibility update; it rereads the authorized journey before and after a successful optimistic mutation. The preferences repository owns preference defaults, validation, identity-bound reads, and upserts; its current forced `prefer` image behavior remains characterized rather than redesigned. The research-status repository owns the identity-bound observable request-status read and its public projection. The snapshots repository owns identity-authorized snapshot creation and listing plus the current journey-export projection. Snapshot creation has no capacity or retention limit, and export intentionally performs the existing duplicate authorized journey reads. Research prompt policy imports only the performer/preset catalog, shared research contracts, and locale naming; it owns no provider transport, streaming, repair, validation, quota, usage, or persistence behavior. The provider-stream module receives an already assembled request body and hides the primary request's OpenAI SSE, timeout/abort, terminal-outcome, diagnostic, and provider-usage mechanics. It does not choose prompts, tools, limits, retry policy, repair/recovery order, quotas, costs, or persistence behavior.

## Routes

### Pages

| Route | Purpose |
| --- | --- |
| `/` | Start a journey and select research settings. |
| `/journeys/:journeyId` | Open the current journey turn. |
| `/journeys/:journeyId/turns/:turnId` | Open a specific saved turn. |
| `/journeys/:journeyId/map` | Display the saved journey graph. |
| `/journeys` | List all journeys by their first explored question and creation time. |
| `/library` | Redirect legacy links to `/journeys`. |
| `/bookmarks` | Display explicitly bookmarked questions and topics. |
| `/usage` | Display live-run and spend limits. |
| `/settings` | Edit account and experience preferences. |

### API

| Route | Methods | Responsibility |
| --- | --- | --- |
| `/api/bootstrap` | `GET` | Return viewer, preferences, models, performers, and research presets. |
| `/api/session` | `GET` | List journeys visible to the current session. |
| `/api/session/upgrade` | `POST` | Transfer eligible guest data to a signed-in identity. |
| `/api/preferences` | `GET`, `PUT` | Read or replace preferences. |
| `/api/bookmarks` | `GET`, `POST` | List or add identity-scoped topic bookmarks. |
| `/api/bookmarks/:turnId` | `DELETE` | Idempotently remove a topic bookmark. |
| `/api/bookmarks/import` | `POST` | Idempotently import authorized legacy browser bookmarks. |
| `/api/journeys` | `GET` | List journeys visible to the current identity. |
| `/api/journeys/:journeyId` | `GET`, `PATCH`, `DELETE` | Read, update, hide, or delete a journey. |
| `/api/journeys/:journeyId/advance` | `POST` | Choose, reject, delegate, branch, or pause. |
| `/api/journeys/:journeyId/export` | `GET` | Export a persisted journey. |
| `/api/journeys/:journeyId/snapshots` | `GET`, `POST` | List or create snapshots. |
| `/api/research` | `POST` | Create or advance a live research journey. |
| `/api/research/:runId` | `GET` | Read observable research status and events. |
| `/api/landing-recommendations` | `GET`, `POST` | Read permanent global editorial pages or publish an authenticated new batch. |
| `/api/usage` | `GET` | Return rolling usage and spend availability. |
| `/api/diagnostics` | `GET` | Return privacy-filtered provider diagnostics. |
| `/api/health` | `GET` | Return runtime health metadata. |

The route files are thin adapters. Domain validation and persistence live in `lib/`.

## Live research transaction

1. Resolve the guest or ChatGPT identity and verify journey ownership.
2. Validate the request and reserve an idempotency key.
3. Atomically reserve the primary provider call against per-identity and project spend limits.
4. Build a bounded context packet from persisted journey state and preferences.
5. Call the selected OpenAI model through the Responses API with web search enabled.
6. Normalize provider-returned sources, usage, request identifiers, and observable status events.
7. Validate structured output, answer length, citations, media provenance, and exactly two distinct next questions.
8. If required and separately admitted, run a bounded citation repair or evidence recovery request.
9. Commit the turn, options, graph edge, sources, handoff, research metadata, and usage in D1.
10. Return only committed content.

A timeout, provider failure, invalid output, citation failure, ownership conflict, or stale journey version does not create a ready turn.

## Persistence

The schema in `db/schema.ts` groups records into:

- identities and preferences;
- journeys, turns, options, actions, edges, snapshots, and per-turn bookmarks;
- research requests, runs, and observable events;
- sources, source relations, and turn media;
- committed-turn usage and provider-call usage;
- authoritative per-provider-call cost reservations and settlements;
- permanent global landing-recommendation batches and cards;
- a legacy personalized-starter cache table retained without a runtime route;
- legacy tables retained for backward-compatible reads.

Important constraints:

- provider subject identifiers are unique within an identity provider;
- request idempotency keys are unique per identity;
- at most one `reserved` or `researching` request may hold the foreground lease for an identity;
- action idempotency keys are unique per journey;
- a turn may be bookmarked only once per identity;
- one research run belongs to one turn;
- option position is unique within a turn option-set version;
- source canonical URLs are unique;
- card position is unique within each landing recommendation batch;
- journey versions provide optimistic concurrency control.

`drizzle/` is ordered migration history. Deployed migrations are not rewritten.

## Identity and authorization

Unsigned visitors receive temporary guest identities. Sign in with ChatGPT supplies the signed-in identity boundary. Server routes resolve the viewer and enforce ownership before reading or mutating private records.

Guest upgrade is explicit and idempotent. It transfers eligible records to the signed-in identity without treating sign-in itself as a mutation request.

Bookmarks are durable D1 records scoped to the resolved viewer identity. Listing joins the authorized journey and ready turn into a complete UI projection, so the browser does not fetch each bookmarked journey separately. Journey pinning and snapshots remain separate concepts. The legacy `curiositypedia:bookmarked-turns` browser value is only an import source: it is removed after the server confirms an authorized, idempotent import and is never used for subsequent reads or writes.

## Provider integration

OpenAI Responses is the only enabled live provider. Model configuration, capability flags, prices, and research presets are defined in `lib/catalog.ts`. Provider calls use `store: false` and server-only credentials.

Persisted provider metadata includes token dimensions, web-search and fetch counts, latency, estimated cost, rate date, provider request identifiers, model snapshot, prompt version, and categorical outcome. Prompts, answer text, retrieved page bodies, credentials, and raw provider envelopes are excluded from diagnostics.

## Evidence rules

- Citations must resolve to the normalized source set returned by the provider.
- Consulted, cited, and image relations are stored separately.
- Factual media records retain the source page, caption, alternative text, and provenance fields.
- Unsupported answer blocks can be repaired, recovered through a targeted search, or removed only when the remaining answer still satisfies the minimum evidence contract.

## Localization

The interface supports English, Spanish, French, German, Portuguese, Hindi, Bengali, Arabic, Simplified Chinese, Japanese, and Korean. Preferences store both interface locale and default output locale. Each journey and turn stores its output locale so existing content is not reinterpreted when account preferences change.

## Usage controls

Every OpenAI provider attempt must first create one conditional D1 reservation. The single insert admits the call only when its conservative request envelope fits both the identity and project rolling allowances. Primary attempts, automatic retries, image-note repair, citation repair, citation recovery, and question redraw reserve independently. Known provider usage settles to actual estimated cost; an ambiguous or unrecorded outcome retains the full hold. Reservation persistence is fail-closed, while diagnostic persistence remains fail-open. `CURIOSITYPEDIA_DAILY_BUDGET_USD` configures the rolling project threshold.

The envelope prices the serialized request's UTF-8 byte length as an upper bound for caller-supplied input tokens, configured output tokens, and configured tool-call count. Provider-reported actual cost always replaces the hold even when it is higher. Because the provider does not accept a maximum-dollar parameter and may add tool context after dispatch, this closes parallel admission against reserved amounts but is not proof that one provider call can never exceed its reservation.

The usage summary reports settled spend and active/uncertain holds separately and subtracts both from remaining allowance. Reservation-time accounting closes parallel cost admission across identities, but it does not prevent guest-cookie rotation or replace future per-IP/device abuse controls.

Foreground live research uses a database-time lease on `research_requests`: one active request per identity, a 45-second expiry, renewal every 15 seconds, and an opaque server-only fencing token. Ordinary admission atomically replaces an expired lease; explicit takeover must target the active request observed by the losing tab, so a committed request or another takeover cannot be replaced accidentally. The old worker observes ownership loss through renewal or the required check before each provider attempt and cooperatively aborts. Already-dispatched provider work may still finish or incur an uncertain/full cost hold, but its stale token can never commit a partial journey. Create and advance commits make every mutation depend on the successful fenced root insert.

Opening-turn background research stores the provider response ID and request state on the identity-owned `research_requests` row. The interface polls only while work is active. Any signed-in device can retrieve the same stored provider result, claim a short D1 finalization lease, validate it through the normal live-research pipeline, and atomically commit the Journey. At most five opening turns may be active per identity; failed rows expose an explicit retry. This is provider-managed background execution plus database reconciliation, not an application queue.

`lib/live-repository.ts` owns the admission, lease, and atomic-commit boundary. Guest-cookie rotation and broader abuse controls do not share the lease mechanism. The application does not group rotated guest identities by IP, device, or another caller signal; introducing that behavior would require an explicit identity, privacy, retention, and request-admission policy.

`CURIOSITYPEDIA_OPENAI_ENABLED=false` is the server-side emergency switch for every OpenAI-backed operation. Model authorization for guest and ChatGPT identities is defined by `lib/usage-policy.ts` and enforced before live research and redraw provider work.

`provider_cost_reservations` is authoritative for cost admission. `provider_usage_events` records privacy-filtered diagnostics for every OpenAI operation, and `usage_events` records committed-turn usage; neither authorizes new spend.

## Build and deployment

GitHub `main` is the default and production source branch. CI runs on pull requests and pushes to `main`:

1. dependency installation;
2. generated architecture-index verification;
3. ESLint;
4. TypeScript checking;
5. production-dependency security audit;
6. production build and automated tests.

The Sites build produces a Cloudflare Worker-compatible Vinext bundle. A release packages the build output, `.openai/hosting.json`, and D1 migrations, saves a version tied to the exact `main` commit, and explicitly deploys that version. GitHub pushes do not trigger deployment by themselves.

Sites packages the complete `drizzle/` history with each release. Migrations must be applied in order before the corresponding application version serves traffic; deployed migrations are never edited or reordered.

## Generated dependency index

[code-index.md](code-index.md) is generated from local imports by `scripts/architecture-index.mjs`.

```bash
npm run architecture:update
npm run architecture:check
```

Regenerate it after adding, deleting, or changing imports in TypeScript or JavaScript modules.
