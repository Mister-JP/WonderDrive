# Phase 0 — prove the runway

Phase 0 exists to remove deployment and architecture uncertainty before paid AI behavior is connected. It produces a public, honest product shell and a boring, repeatable delivery path.

## Exit criteria

### Public access

- Deploy a production Sites URL.
- Open the URL in a private browser window with no developer session.
- Confirm the landing page and `/api/health` load without installation, a custom domain, or GitHub access.
- Record the target Sites workspace, plan, region, public-sharing policy, and observed limitations.

### Identity

- Preserve anonymous access to the public landing page.
- Verify dispatch-owned Sign in with ChatGPT for a protected test surface.
- Confirm the stable identity subject reaches server code and sign-out works.
- Treat SIWC as identity—not proof of workspace membership.
- Do not add app-owned passwords or public email flows in Phase 0.

### D1

- Apply the generated schema migration to the Sites-managed D1 database.
- Prove prepared reads/writes, batch behavior, ownership lookup, and optimistic version updates.
- Exercise export/backup and restore in the actual target environment.
- Keep D1 as the single canonical store; do not introduce Supabase unless the non-ChatGPT identity fallback is activated by an explicit decision.

### Secrets and server routes

- Store provider keys in Sites secrets, never in source or browser bundles.
- Scan production assets and logs for secret values.
- Verify the ordinary health/server route and one mocked streaming route.
- Prove a 60–120 second SSE response survives the real Sites path and reconnects coherently before selecting a separate Worker.

### Delivery

- Require CI to install from the lockfile, lint, build, and run rendered-output tests.
- Review a saved candidate before the production deploy.
- Smoke-test the production URL after deploy and document the rollback path.
- Keep the repository public-safe: no local captures, QA renders, private research logs, credentials, or machine-specific paths.

## Phase 0 deliverable

A judge can open the public URL, understand WonderDrive within one viewport, interact with the honest seed shell, inspect the public repository and blueprint, and see that the runtime, data model, security posture, and next implementation gates are coherent.

## Not Phase 0

- live model or web-search calls;
- automatic or background journeys;
- queues, schedulers, Trigger.dev, or parallel provider fan-out;
- production account signup beyond the verified Sites identity path;
- comparison generation, generated factual media, or paid speech.

The first live AI milestone begins only after these gates pass: one OpenAI Responses adapter, one bounded foreground research turn, observable evidence events, a validated sourced answer, and exactly two options committed atomically.
