# WonderDrive

WonderDrive is an audience-directed curiosity performance. A visitor chooses a performer/model and a question; that same model researches the live web, turns the evidence into a composed explanation, and offers exactly two earned questions for the audience to choose between.

This repository is the public implementation for the 2026 OpenAI Build Week hackathon. It is currently at **Phase 0: foundation**. The public shell, supported Sites runtime, D1 contract, identity seam, CI, and documentation are present. Live model research is intentionally not represented as complete yet.

**Live Phase 0:** [wonderdrive.jigs.chatgpt.site](https://wonderdrive.jigs.chatgpt.site)

## Product contract

- One selected model researches and performs each turn.
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

The local site runs at `http://localhost:3000`. The public shell makes no provider request, so an API key is not required for Phase 0.

## Validation

```bash
npm run lint
npm test
npm run db:generate
```

`npm test` performs a production Sites build and verifies both the public page and the health endpoint.

## Repository map

```text
app/                  Public shell, identity helper, and server routes
db/                   Canonical D1 schema
drizzle/              Generated, reviewed SQL migrations
docs/                 Final blueprint, architecture, and Phase 0 gates
tests/                Rendered production checks
.openai/hosting.json  Logical Sites-managed bindings
```

## Documentation

- [Phase 0 acceptance gates](docs/phase-0.md)
- [Final architecture decisions](docs/architecture.md)
- [Final product and engineering blueprint](docs/WonderDrive_Final_Product_and_Engineering_Blueprint_v3_Research_First.docx)

## Status and scope

The current page is an honest public foundation, not a simulated AI demo. The next implementation work is to prove the target Sites account, D1, SIWC, secrets, and foreground streaming behavior before adding the first OpenAI Responses research adapter.

Automatic journeys, scheduled/background continuation, Trigger.dev, provider fan-out, and live parallel comparison are outside the hackathon scope.

## Contributing and security

See [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request. Please report vulnerabilities through the process in [SECURITY.md](SECURITY.md), not a public issue.

## License

No open-source license has been selected yet. Until one is added, copyright law reserves all rights to the project owner.
