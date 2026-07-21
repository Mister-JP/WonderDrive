# CuriosityPedia

[![CI](https://github.com/Mister-JP/CuriosityPedia/actions/workflows/ci.yml/badge.svg)](https://github.com/Mister-JP/CuriosityPedia/actions/workflows/ci.yml)
[![Live site](https://img.shields.io/badge/live-CuriosityPedia-111827)](https://curiositypedia.jigs.chatgpt.site)
[![License: MIT](https://img.shields.io/badge/license-MIT-2563eb.svg)](LICENSE)

CuriosityPedia turns one question into a persistent, source-backed map of discovery. Every researched turn preserves its answer, evidence, provider usage, and a set of image-linked questions that open different directions for what to explore next.

[Open CuriosityPedia](https://curiositypedia.jigs.chatgpt.site) · [Read the product principles](docs/curiosity-learning-north-star.md) · [Explore the architecture](docs/architecture.md)

## Inspiration

I am a deeply visual learner, and I loved encyclopedias as a kid. Words can feel intimidating to me, and I often struggle to understand an idea when it is presented only as a wall of text. Give me an image, though, and I can spend ages observing it, noticing tiny details, and following the questions those details inspire.

That way of learning has made today's chatbots frustrating for me. They rarely act as great visual explainers: they do not proactively find the remarkable images already available on the internet and use them to make an idea easier to understand. For about three years, I kept expecting someone to build a chatbot capable of truly visual communication. I never found the product I was waiting for.

This hackathon gave me the opportunity to show how learning and information discovery could feel instead: visual, inviting, playful, and exciting. CuriosityPedia is the product I wanted to use myself.

## What it does

CuriosityPedia creates a beautiful, source-backed visual encyclopedia about anything a person wants to learn. Each exploration combines a researched explanation with 8–12 carefully selected images and an image-inspired question for every visual.

After exploring the encyclopedia, the learner can answer those questions, choose any one that sparks their curiosity, and generate a new encyclopedia about that topic. Every choice becomes another branch in a persistent journey map, so learners can see the rabbit holes they followed and return to any earlier discovery.

People can also revisit, search, bookmark, snapshot, export, and continue their learning journeys. Guest sessions, ChatGPT-authenticated identities, app-funded allowances, and optional session-only bring-your-own-key support make the experience accessible while keeping provider usage controlled.

## How we built it

I began in Codex with **GPT-5.6 Sol at medium reasoning**, using it as a product and design collaborator while I worked through the concept, user experience, and interface. I then used Codex's image-generation capabilities to explore and refine the visual direction of the application.

From there, I spent most of the week coding—or “Codexing”—and deploying the website iteratively. OpenAI Sites powered the deployment workflow, while the OpenAI Responses API became the brain of the application: researching each topic, searching for useful images, producing structured visual explanations, and creating the questions that lead learners into their next rabbit hole.

The application itself is built with TypeScript, React, Vinext, Cloudflare D1, and Drizzle ORM. Codex helped throughout the process with product brainstorming, UI exploration, implementation, debugging, testing, architecture, and deployment.

## Challenges we ran into

**TL;DR: time management and token management.**

Design was a major challenge. Image generation in Codex is powerful, but the output is not always easy to control, and maintaining consistency across several application screens required a great deal of iteration.

Model selection also had a significant effect on the build. I started with GPT-5.6 Sol, which helped me make fast progress. As I approached my quota limit, I moved some work to GPT-5.6 Terra. The change forced me deeper into the implementation details and sometimes made obvious visual or product issues easier to miss. It taught me that model capability can matter as much as model cost when time is limited.

The other major challenge was protecting the product vision. It is surprisingly difficult to build educational software that is neither a conventional chatbot nor a social-media feed. Both patterns are so general—and so familiar—that it is easy to fall back into them. My north star was simple: make something I would genuinely love to use.

## Accomplishments that we're proud of

I am proud that the finished product is close to what I imagined. More importantly, I built something of this scope by myself in one week. That gives me immense joy and confidence in what a solo creator can make with the right tools.

## What we learned

Understanding model capabilities is essential. Cost matters, but capability matters too: a cheaper model is not economical if it cannot reliably do the work that a frontier model can.

I also learned how important it is to plan well because pivots are expensive in both time and tokens. A pivot does not necessarily mean the planning failed; sometimes you cannot know what you want until you build and use it. Some ideas sound wonderful in your head but fall flat in the product, while simpler ideas are often overlooked merely because they do not sound exciting enough at first.

## What's next for CuriosityPedia

I believe CuriosityPedia can become a wonderful way for children—and curious people of any age—to encounter new ideas through the eyes of great photographers, illustrators, scientists, historians, and institutions.

Today, the experience is produced by two primary agents. In the future, I want to build an agentic editorial staff that can research, fact-check, curate visuals, shape learning journeys, and continually improve the catalog. My goal is for CuriosityPedia to become a one-stop place for anyone who wants to learn about the beautiful world we live in.

For now, I have avoided the most expensive frontier models in the live API because I cannot yet afford that level of experimentation at scale. As newer and more capable models become accessible, I plan to improve the research quality, visual curation, and interface—especially for visual learners like me.

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
