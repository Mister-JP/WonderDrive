# CuriosityPedia

[![CI](https://github.com/Mister-JP/CuriosityPedia/actions/workflows/ci.yml/badge.svg)](https://github.com/Mister-JP/CuriosityPedia/actions/workflows/ci.yml)
[![Live site](https://img.shields.io/badge/live-CuriosityPedia-111827)](https://curiositypedia.jigs.chatgpt.site)
[![License: MIT](https://img.shields.io/badge/license-MIT-2563eb.svg)](LICENSE)

CuriosityPedia turns one question into a persistent, source-backed map of discovery. Every researched turn preserves its answer, evidence, provider usage, and a set of image-linked questions that open different directions for what to explore next.

[Open CuriosityPedia](https://curiositypedia.jigs.chatgpt.site) · [Read the product principles](docs/curiosity-learning-north-star.md) · [Explore the architecture](docs/architecture.md)

## What it does

- Builds branching research journeys with citations and durable history.
- Lets people revisit, search, map, bookmark, snapshot, export, and continue their learning.
- Supports guest sessions and ChatGPT-authenticated identities with small app-funded allowances and optional session-only BYOK.
- Uses background research status, usage controls, and failure-safe persistence for long-running provider work.
- Serves an editor-managed discovery catalog for approachable starting questions.

## Stack

- TypeScript, React 19, Vinext, and the Next-compatible App Router
- OpenAI Responses API for live research and structured output
- Cloudflare D1 through the OpenAI Sites-managed `DB` binding
- Drizzle ORM with reviewed SQL migrations in `drizzle/`
- GitHub Actions for repository validation

The browser talks only to application routes. Server routes own authentication, validation, OpenAI requests, quota enforcement, and persistence.

## Run locally

Requirements: Node.js 22.13.0 or newer, npm, and a D1-compatible local database. An OpenAI API key is needed only for live research; the automated tests do not call the provider.

```bash
npm ci
cp .env.example .env.local
npm run dev
```

The development server listens on `http://localhost:3000` by default.

### Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `OPENAI_API_KEY` | Live mode only | Authenticates OpenAI Responses API calls. |
| `CURIOSITYPEDIA_OPENAI_ENABLED` | No | Disables every OpenAI-backed operation when set to `false`; enabled by default. |
| `CURIOSITYPEDIA_DAILY_BUDGET_USD` | No | Sets the rolling 24-hour project spend limit; defaults to `25`. |
| `EDITOR_API_KEY` | Editorial publishing only | Authorizes permanent discovery-catalog batches. |

Keep real values in ignored local environment files or Sites runtime configuration. Never expose a server value through a `NEXT_PUBLIC_` variable.

Learners may instead add their own OpenAI API key in Settings. That key stays in the current tab's `sessionStorage`, is attached only to provider-backed same-origin API routes, and is never written to D1. App-funded rolling allowances are $0.50 for guests and $1.00 for signed-in identities; BYOK requests do not consume those dollar allowances.

## Development

Run the same checks as CI:

```bash
npm run architecture:check
npm run lint
npm run typecheck
npm run audit
npm test
```

`npm test` includes a production build plus routing, rendered-output, localization, repository-boundary, provider, usage, bookmark, background-research, and persistence tests.

After adding, deleting, or changing local TypeScript or JavaScript imports, regenerate the dependency index:

```bash
npm run architecture:update
```

For schema changes, run `npm run db:generate`, inspect the SQL, and keep every previously deployed migration in order.

## Repository map

| Path | Purpose |
| --- | --- |
| `app/` | Pages, API routes, client transport, authentication, and interface code |
| `lib/` | Domain contracts, repositories, OpenAI integration, validation, and usage policy |
| `db/` | Current D1 schema and database binding helper |
| `drizzle/` | Ordered SQL migrations and migration metadata |
| `editorial/` | Reviewed discovery-catalog source batches |
| `tests/` | Build-level and module-level automated tests |
| `docs/architecture.md` | System boundaries, flows, storage, and deployment behavior |
| `docs/code-index.md` | Generated local dependency map |
| `.openai/hosting.json` | Sites project identifier and logical storage bindings |

Generated builds, browser traces, screenshots, local databases, temporary research material, and environment files are intentionally excluded from source control.

## Deployment

OpenAI Sites builds and deploys this repository as a Cloudflare-compatible worker. A release packages the validated Vinext output, Sites metadata, and Drizzle migrations; pushing to GitHub alone does not publish production.

## Contributing and security

Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request. Report security issues through the private process in [SECURITY.md](SECURITY.md), not a public issue.

CuriosityPedia is available under the [MIT License](LICENSE).
