# WonderDrive

WonderDrive is an audience-directed curiosity performance. A visitor chooses a performer and a question, watches the research stage, receives a sourced explanation, and chooses between exactly two earned ways forward.

This repository is the public implementation for the 2026 OpenAI Build Week hackathon. It is currently at **Phase 1: deterministic product loop**. A judge can create, direct, reject, delegate, save, reload, branch, map, delete, and compare journeys through the public product. The complete interaction uses reviewed fixtures, so it proves the experience and persistence contract without pretending that live model research is connected.

**Live Phase 1:** [wonderdrive.jigs.chatgpt.site](https://wonderdrive.jigs.chatgpt.site)

## Product contract

- One selected performer carries each turn; the Phase 1 model ticket is an explicitly labeled fixture.
- Research activity and sources are observable; hidden chain-of-thought is not exposed.
- Every ready turn ends with exactly two distinct next questions.
- The journey advances only after an explicit audience action.
- Saved journeys form a branchable graph, not a chat transcript.
- Comparison reads previously saved journeys and never launches hidden parallel work.

## Stack

- OpenAI Sites-compatible Vinext application
- React 19, Next-compatible App Router, TypeScript, and Tailwind CSS
- Sites server routes for API work and provider secrets
- Cloudflare D1 through the Sites-managed `DB` binding
- Drizzle schema and generated SQL migrations
- Dispatch-owned Sign in with ChatGPT seam for durable identity
- GitHub Actions for lint, build, and rendered-output tests

## Local development

Requirements: Node.js `22.13.0` or newer.

```bash
npm ci
cp .env.example .env.local
npm run dev
```

The local site runs at `http://localhost:3000`. Phase 1 makes no provider request, so no API key is required.

Apply both SQL files in `drizzle/` to a fresh local D1 database before exercising the API. Sites applies the packaged migrations when a version is deployed.

## Validation

```bash
npm run lint
npm run typecheck
npm test
npm run db:generate
```

`npm test` performs a production Sites build, verifies the public page and health endpoint, and checks deterministic fixture invariants.

## Repository map

```text
app/                  Product experience, identity helper, and server routes
db/                   Canonical D1 schema
drizzle/              Generated, reviewed SQL migrations
lib/                  Contracts, reviewed fixtures, identity, and D1 repository
docs/                 Final blueprint, architecture, and phase gates
tests/                Rendered production and fixture checks
.openai/hosting.json  Logical Sites-managed bindings
```

## Documentation

- [Phase 0 acceptance gates](docs/phase-0.md)
- [Phase 1 implementation contract](docs/phase-1.md)
- [Final architecture decisions](docs/architecture.md)
- [Final product and engineering blueprint](docs/WonderDrive_Final_Product_and_Engineering_Blueprint_v3_Research_First.docx)

## Status and scope

The current product is an honest deterministic rehearsal, not a simulated claim of live AI. The next implementation milestone is the first bounded OpenAI Responses research adapter, connected behind the canonical turn contract after the foreground streaming and cost gates are verified.

Automatic journeys, scheduled/background continuation, Trigger.dev, provider fan-out, and live parallel comparison are outside the hackathon scope.

## Contributing and security

See [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request. Please report vulnerabilities through the process in [SECURITY.md](SECURITY.md), not a public issue.

## License

No open-source license has been selected yet. Until one is added, copyright law reserves all rights to the project owner.
