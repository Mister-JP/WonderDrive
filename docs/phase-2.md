# Phase 2 — bounded live research

Phase 2 replaces the Phase 1 fixture at the canonical turn-adapter seam while keeping the free fixture available as an explicit demo choice. Live mode uses one selected OpenAI model for both research and performance. It does not use a hidden planner, critic, summarizer, provider fan-out, queue, scheduler, or background continuation.

## Foreground request

1. The browser submits a seed or explicit path action with an idempotency key and expected journey version.
2. The server resolves ownership, validates the action, enforces the journey and rolling live-run limits, assembles the compact ancestor context, and reserves a `research_requests` row.
3. The same open HTTP request calls the OpenAI Responses API with the visitor's selected compatible model, built-in text and optional image search, `store: false`, a strict JSON schema, and preset-specific tool, output, reasoning, and wall-time ceilings.
4. WonderDrive normalizes only observable activity for the research stage. It never streams hidden chain-of-thought or raw provider envelopes.
5. The output must contain two to four bounded answer blocks and exactly two distinct next questions. Each answer block must cite at least one URL in the provider-returned source set.
6. Only after validation does one D1 batch commit the journey/turn, options, action, research run/events, sources/relations, and usage fields. A disconnect, provider error, timeout, invalid citation, duplicate option pair, or version race marks the request failed and commits no turn.

## Research presets

| Preset | Web tool calls | Output-token ceiling | Reasoning effort | Foreground timeout |
| --- | ---: | ---: | --- | ---: |
| Spark | 1 | 3,000 | low | 45 seconds |
| Standard | 2 | 4,800 | medium | 70 seconds |
| Deep | 3 | 6,400 | high | 90 seconds |

These are hard request ceilings, not estimates of actual usage. The research ledger stores provider input, output, reasoning, and total tokens; web-search call count; provider response ID; and elapsed milliseconds. Live runs are limited to four per rolling 24 hours for a guest and twenty for a signed-in ChatGPT identity. The provider account can still impose stricter budget, quota, or rate limits.

## Honest modes

- **GPT-5.6 Luna · live:** metered OpenAI token and web-search usage. The visitor must keep the page open.
The app never substitutes another model after an error. The visitor receives a retryable error explaining that nothing was committed.

## Path controls

- Choose and Delegate launch one new foreground live research call for a live journey.
- Reject Both stays deterministic and free for fixture journeys. For live journeys it calls the selected OpenAI model once without web research, validates exactly two replacement paths, records the provider usage, and creates no new researched turn.
- Manual comparison reads two saved journeys and launches no model work.
- Automatic journeys, parallel path research, Trigger.dev, scheduled continuation, and background jobs remain out of scope.

## Verification

```bash
npm run lint
npm run typecheck
npm test
```

The release smoke test must additionally use the hosted secret to create one Spark live journey on the public URL, verify at least two inspectable sources and exactly two paths, reload the saved journey with the same guest cookie, and delete the smoke-test journey.
