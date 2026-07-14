# WonderDrive V3 — research-first implementation contract

This release closes the implementation gaps identified against the final research-first blueprint while retaining the foreground-only hackathon architecture.

## Turn contract

- Sage, Spark, and Mechanist are versioned performer contracts with visible samples, values, voice traits, failure boundaries, and research posture.
- The model registry discloses provider, snapshot, capabilities, speed, quality, cost band, price-effective date, and recommendation state. Visitors can select any current general-purpose OpenAI model compatible with WonderDrive's Responses, web-search, and structured-output contract; GPT-5.6 Luna remains the recommended default.
- Research preset, answer density, and factual-image preference are independent inputs.
- The same selected model researches and performs each live turn. It receives a bounded context packet with ancestor handoffs and audience signals.
- A validated turn contains two to five cited answer blocks and exactly two distinct next paths. Unchosen paths stay open and can create visible branches later.

## Trust and durability

- Stable ChatGPT subject identifiers are hashed before storage. Guest cookies are HttpOnly, SameSite=Lax, scoped to the site, and time-limited.
- Signing in does not silently merge data. A visitor explicitly upgrades the guest library through an idempotent audited mutation.
- Mutations enforce same-origin browser requests, ownership, idempotency, and optimistic journey versions.
- Provider prompts treat retrieved pages as untrusted evidence, never as instructions. Raw provider errors and source bodies are not exposed.
- Foreground research uses a per-identity lease, rolling run limits, per-identity spend ceilings, and a configurable project budget kill switch.
- Failed, disconnected, timed-out, or invalid research commits no partial turn.

## Saved product surfaces

- The library supports search, performer filtering, pin, hide, rename, deletion confirmation, deterministic snapshots, and JSON export.
- Journey maps show turns plus both option states; every proposed option remains actionable.
- Comparisons disclose performer, model, preset, dates, actions, redraws, delegations, open branches, timelines, estimated cost, and confounders without launching provider work.
- Audience preferences persist answer density, text size, factual-image posture, speech speed, and reduced motion.
- Performance pages include read-aloud, inspectable source links, run metadata, usage and estimated cost, and an honest text-only fallback when no factual image is supported.

## Deployment and operations

The Sites build packages `.openai/hosting.json` and all reviewed Drizzle migrations. Deployment applies the migration that preserves existing journeys while mapping retired performer identifiers to the current contracts. The `/api/health` response advertises the V3 capability contract, and CI runs lint, type checking, production build, rendered-shell tests, fixture invariants, and live adapter normalization tests without provider spend.
