# Contributing to WonderDrive

WonderDrive is in an intentionally narrow hackathon build. Contributions should strengthen the researched curiosity loop before expanding feature breadth.

## Before a pull request

1. Read `docs/phase-0.md` and the relevant section of `docs/architecture.md`.
2. Keep secrets and provider keys server-side. Never add a provider key to browser code, fixtures, logs, or screenshots.
3. Preserve the product invariants: one performer, bounded foreground research, honest evidence, exactly two options, and no invisible continuation.
4. Add or update tests for the behavior being changed.
5. Run:

   ```bash
   npm run lint
   npm test
   ```

6. If the D1 schema changes, run `npm run db:generate`, inspect the SQL, and commit the migration.

## Pull requests

Keep pull requests small enough to review. Describe what changed, why it matters to the user, what was deliberately left out, and the checks performed. Do not mix prompt/model changes with unrelated interface or database changes when they can be evaluated separately.

## Accessibility

Core flows must work with keyboard and screen readers, preserve visible focus, respect reduced motion, and never communicate graph or state meaning through color alone.
