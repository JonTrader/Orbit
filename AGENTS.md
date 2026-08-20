# Orbit — agent notes

## Read order

1. [`CONTEXT.md`](./CONTEXT.md) - vocabulary only  
2. [`docs/spec.md`](./docs/spec.md) - MVP requirements (stack, API shape, product rules)  
3. [`docs/adr/`](./docs/adr/) - hard decisions  
4. [`Orbit_Granular_Build.md`](./Orbit_Granular_Build.md) - one phase per conversation (copy that phase's handoff prompt)
5. [`Orbit_Test_Plan.md`](./Orbit_Test_Plan.md) - what to test for the phase you are implementing

## Domain language

Prefer CONTEXT terms (Space, Task, Monthly, Note, Active Space, Reminder, Invite). Do not invent synonyms.

## Product spine (MVP)

Household-first coordination: Daily Tasks vs Monthlies as separate domains, Space-level sharing/RBAC, Upcoming as a read-only view, email Reminders via Inngest + Resend. Dual API: `/api/v1` Route Handlers + web Server Actions over shared domain services.

## Service layout

- `lib/services/notifications.ts` - Reminder candidate scanning / sending only.
- `lib/services/notification-preferences.ts` - per-user per-Space preference CRUD. Read-only Members may update their own preferences.

## ID conventions

App tables (`space`, `section`, `task`, `monthly`, `note`, `invite`, ...) use `uuid` columns with `defaultRandom()`. But Better Auth generates `user.id` as 32-char alphanumeric (`a-z`, `A-Z`, `0-9`), not a UUID (`lib/auth.ts` sets no custom `generateId`). Any API schema field that holds a user ID (`assigneeId`, `completedBy`, ...) must validate with `z.string().min(1)`, never `z.uuid()`.

## Testing (required per phase)

Source of truth: [`Orbit_Test_Plan.md`](./Orbit_Test_Plan.md).

When implementing **any** build phase (A–J):

1. Open that plan and read the **Phase X** section for the phase you are shipping (stack, layout, and **What to test**).
2. Implement those tests **in the same phase** as the feature code. Do not defer the suite to Phase J.
3. Treat the phase as incomplete until Acceptance **and** that phase's "What to test" items are green (Phase C OAuth browser click-through may stay manual as noted in the plan).
4. Keep earlier phases' suites passing; do not delete or skip B/D coverage when adding API or E2E later.
5. Prefer domain/service tests for business rules; keep Route Handlers and Server Actions thin. From Phase G, user-visible bugs get a Playwright repro when practical.

Stack (locked in the test plan): Vitest + real Neon Postgres via `DATABASE_URL_TEST` from Phase B; Playwright from Phase G. No SQLite stand-in.

### Running the suite

```
npm test          # everything
npm run test:db   # Phase B db suite only
npm run test:auth # Phase C auth suite only
npm run test:watch
```

`DATABASE_URL_TEST` must point at a **dedicated Neon branch**, never production: the run drops and recreates the `public` schema before migrating. `tests/setup/env.ts` requires the `DATABASE_URL_TEST_CONFIRMATION=dedicated-neon-branch` acknowledgement, refuses a missing or application-equal URL, and refuses a URL on the same database host as `DATABASE_URL`. Test files share that one branch, so `vitest.config.mts` disables file parallelism and each file seeds its own fixtures after `truncateAll()`. Do not run full suites concurrently against the same branch; the CI test job uses a shared concurrency group because push and pull-request workflows otherwise race while resetting the schema.

Migrations live in `drizzle/`; regenerate with `npm run db:generate` after editing `lib/db/schema.ts` and apply with `npm run db:migrate`. `tests/db/migrations.test.ts` also verifies that the handwritten Section immutability and `updated_at` triggers are present after migration.

### API test helpers

API Route Handler tests share Vitest mocks and request helpers:

- `tests/setup/api-mocks.ts` - `vi.mock` for `@/lib/auth` and `@/lib/db/client`. Import this **first** in any API test file so the mocks are registered before Route Handler imports.
- `tests/setup/api.ts` - shared helpers: `authenticateAs`, `unauthenticate`, `jsonRequest`, `responseJson`, route context builders, `ErrorBody`, and `apiTestLifecycle`.
- Each API test file still owns its `beforeAll`/`beforeEach` wiring via `apiTestLifecycle()`.

## CI

[`.github/workflows/ci.yml`](./.github/workflows/ci.yml) runs on push to `main`/`master` and on pull requests. Today: `lint` + `build` + `test`.

- CI actions are pinned to majors that ship a Node 24 runtime (`actions/checkout@v5`, `actions/setup-node@v5`). The v4 majors run on the deprecated Node 20 runtime and GitHub flags them on every run.
- The `test` job injects test-only env vars on top of the database URL: dummy `BETTER_AUTH_URL` and `BETTER_AUTH_SECRET`. Modules such as `lib/auth.ts` require config at import time outside the build phase, so the vars must be present even though auth is mocked in most tests. Keep them fake; never real credentials. API tests that import `@/lib/api` (the barrel re-exports `requireApiSession`, which loads the real auth chain) need these exported locally too. Tests that only exercise errors/validation helpers import `@/lib/api/errors` and `@/lib/api/validation` directly instead, so they never touch auth.

When adding tests, uncomment the matching job in that file (do not invent a second workflow):

- Phase B: **done** - `test` job is live; it needs GitHub secret `DATABASE_URL_TEST` (dedicated Neon ci branch, not production) and serializes all database test jobs with the `orbit-database-tests` concurrency group
- Phase G: `e2e` job (`npx playwright install --with-deps chromium` then `npm run test:e2e`)
- Phase J: mark checks required; document secrets and how to run tests in README

CI and local dev both run Node 24 (npm 11) - keep them on the same major. npm 10 and npm 11 handle optional peer dependencies differently: npm 10 auto-installs vite 8's optional `esbuild` peer and its `npm ci` rejects locks that lack the 27-entry `node_modules/vitest/node_modules/esbuild` subtree (`Missing: esbuild@0.28.2 from lock file`); npm 11 omits that subtree and accepts the lock either way, and plain `npm install` on npm 11 prunes the subtree if a lock contains it. So committed locks here are npm 11 output by design, and a failing `npx npm@10 ci` is expected version skew, not a defect to repair. Never commit a lock produced with peer/optional resolution disabled (`--legacy-peer-deps`, `--omit=optional`). If the CI Node version ever changes, re-verify the lock with that version's npm before pushing.

## Project status

Completed phases and the current handoff prompt are tracked in [`Orbit_Granular_Build.md`](./Orbit_Granular_Build.md).


<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
