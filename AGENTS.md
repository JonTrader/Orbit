# Orbit

Household-first coordination app for day-to-day to-dos and recurring monthly obligations, with optional personal Spaces.

## Where truth lives

- Vocabulary is [CONTEXT.md](./CONTEXT.md): Space, Task, Monthly, Note, Active Space, Reminder, Activity, Invite. Do not invent synonyms.
- Behavior is [docs/spec.md](./docs/spec.md). Read it before changing domain behavior. Do not restate it here.

## Where code goes

- Domain logic lives in `lib/services`.
- Server Actions are thin wrappers with no business logic. Use `defineAction` from `lib/actions/framework.ts`.
- Do not invent a second path for a flow that already has one. The spec says which surface to use.

## Schema

Edit `lib/db/schema.ts`, run `npm run db:generate`, and commit the migration. Migrate production only when the user explicitly asks.

## Tests

Vitest uses `DATABASE_URL_TEST`. Playwright uses `DATABASE_URL_E2E`. Both are dedicated Neon branches, and the Vitest suite wipes that database. Do not point either at production. Do not run two full suites at once.

## Check your work

Run `npm run typecheck` and the tests that cover the change. For a UI change, exercise the flow in the browser.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
