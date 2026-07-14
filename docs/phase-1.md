# Phase 1 — deterministic product loop

Phase 1 proves that WonderDrive is a coherent, runnable product before paid model and web-search calls are connected. It uses reviewed deterministic fixtures and says so in the interface, API health contract, and repository.

## Delivered experience

- Configure a starting question, performer, and research-depth rehearsal.
- Watch observable research events and a sourced Curiosity Interlude appear in sequence.
- Read a composed answer with inline source markers, an evidence drawer, and a Research Trail that does not expose private reasoning.
- Choose exactly one of two next questions, reject both with grounded/adventurous feedback, or delegate the choice for one turn.
- Save and reload journeys through the Sites-managed D1 binding.
- Revisit an earlier turn and create a visible branch without deleting the existing path.
- Browse a journey map and accessible list-equivalent, resume from the library, and remove a journey.
- Compare two already-saved journeys without launching hidden model work.

## Persistence and identity

- A 256-bit bearer token in an `HttpOnly`, `SameSite=Lax` cookie identifies a bounded guest session; only its SHA-256 digest is stored.
- Guest mode keeps five active journeys. Dispatch-owned Sign in with ChatGPT is the upgrade seam and can claim guest journeys without storing the raw email address.
- All journey reads and writes are scoped to the resolved identity.
- Create and advance requests use idempotency keys. Journey mutations use optimistic versions, and a committed turn has exactly two current options.
- Deletes are tombstones. The browser holds view state only; D1 is canonical.

## Fixture boundary

The Phase 1 engine classifies a question into a reviewed topic set, produces deterministic answer blocks, links official or institutional sources, emits sanitized activity events, and selects one of several distinct question pairs. It does not call a model, search the live web, fabricate streaming, or expose chain-of-thought.

The visible research replay exists to test pacing, progressive facts, cancellation/skip behavior, evidence hierarchy, and the transition into the performance. Phase 2 may replace the fixture adapter with a bounded foreground provider adapter while preserving the same UI and data contracts.

## Explicit exclusions

- no automatic or background journeys;
- no scheduler, queue, Trigger.dev, or durable background job;
- no parallel provider fan-out or live comparison generation;
- no app-owned passwords;
- no claim that the fixture model name represents a charged provider request;
- no live model, web-search, speech, or media charge.

## Verification

Run:

```bash
npm ci
npm run lint
npm run typecheck
npm test
```

The release smoke contract additionally creates a guest journey, confirms two options and five research events, chooses a path, rejects/redraws, delegates once, branches from the root, reloads the library with the same cookie, and manually compares two saved journeys.
