# Contributing

## Change workflow

1. Read [docs/architecture.md](docs/architecture.md) and use [docs/code-index.md](docs/code-index.md) to identify the owning module.
2. Keep provider keys, database credentials, identity headers, and administrative values in server-only code.
3. Preserve API idempotency, ownership checks, atomic turn commits, citation allowlisting, and the two-option turn invariant.
4. Add or update automated tests for behavioral changes.
5. Run `npm run architecture:update` after adding, deleting, or changing local module imports.
6. Run `npm run architecture:check`, `npm run lint`, `npm run typecheck`, `npm run audit`, and `npm test`.
7. For schema changes, run `npm run db:generate` and inspect the generated SQL.

## Pull requests

Document the changed behavior, affected modules, schema or configuration impact, and validation performed. Keep unrelated changes in separate pull requests.

## Compatibility requirements

- Existing persisted journeys must remain readable unless a migration explicitly transforms them.
- Public errors must not expose provider responses, prompts, SQL, credentials, or personal data.
- Core routes and actions must remain keyboard accessible and must not communicate state through color alone.
