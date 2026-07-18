# CuriosityPedia

CuriosityPedia is a Vinext application that creates persistent, source-backed research journeys. Each completed turn stores an answer, its evidence, provider usage, and exactly two possible next questions.

Production: [CuriosityPedia](https://curiositypedia.jigs.chatgpt.site)

## Runtime stack

- TypeScript, React 19, Vinext, and the Next-compatible App Router
- OpenAI Responses API for live research and structured output
- Cloudflare D1 through the OpenAI Sites-managed `DB` binding
- Drizzle ORM with SQL migrations in `drizzle/`
- Sign in with ChatGPT identity headers, with temporary guest identities
- GitHub Actions on `main`

The browser calls only application routes. Server routes perform authentication, validation, OpenAI requests, quota enforcement, and D1 persistence. Provider credentials are never sent to the browser.

See [docs/architecture.md](docs/architecture.md) for component boundaries, request flows, API routes, storage, and deployment behavior. See [docs/code-index.md](docs/code-index.md) for the generated local dependency map.

## Requirements

- Node.js 22.13.0 or newer
- npm
- A D1-compatible database for persistence
- `OPENAI_API_KEY` for live research; tests do not call the provider

## Local setup

```bash
npm ci
cp .env.example .env.local
npm run dev
```

The development server listens on `http://localhost:3000` by default.

Server-side environment variables:

| Variable | Required | Purpose |
| --- | --- | --- |
| `OPENAI_API_KEY` | Live mode only | Authenticates OpenAI Responses API calls. |
| `CURIOSITYPEDIA_OPENAI_ENABLED` | No | Emergency switch for every OpenAI-backed operation. Set to `false` to disable provider calls; enabled by default. |
| `CURIOSITYPEDIA_DAILY_BUDGET_USD` | No | Sets the rolling 24-hour project spend limit; default is `25`. |

The other provider keys in `.env.example` are inactive placeholders. No corresponding adapters are enabled.

## Database

`db/schema.ts` is the current Drizzle schema. `drizzle/` contains ordered migration history. The Sites project exposes D1 as the logical `DB` binding declared in `.openai/hosting.json`.

Generate a migration after an intentional schema change:

```bash
npm run db:generate
```

Inspect generated SQL before committing it. Do not edit or reorder previously deployed migrations.

## Validation

Run the same checks used by CI:

```bash
npm run architecture:check
npm run lint
npm run typecheck
npm test
```

`npm test` performs a production build and runs rendered-output, routing, localization, repository-boundary, provider-adapter, usage, and research-contract tests.

When TypeScript or JavaScript modules are added, removed, or their local imports change, regenerate the dependency index:

```bash
npm run architecture:update
```

## Repository layout

| Path | Contents |
| --- | --- |
| `app/` | Pages, client transport, localization, authentication helper, and API routes |
| `lib/` | Domain contracts, repositories, OpenAI integration, validation, and usage policy |
| `db/` | Current D1 schema and database binding helper |
| `drizzle/` | Generated SQL migrations and migration metadata |
| `tests/` | Build-level and module-level automated tests |
| `scripts/` | Dependency-index generator |
| `.openai/hosting.json` | Sites project identifier and logical storage bindings |
| `.github/workflows/ci.yml` | Validation workflow for pull requests and pushes to `main` |

## Deployment

`main` is the GitHub default and production source branch. A release builds the exact `main` commit, packages the Vinext output with `.openai/hosting.json` and migrations, saves a Sites version, and deploys that version. Sites deployments are explicit; a GitHub push alone does not publish the site.

## Policies

- [CONTRIBUTING.md](CONTRIBUTING.md)
- [SECURITY.md](SECURITY.md)

No open-source license is currently granted.
