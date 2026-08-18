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

## CI

[`.github/workflows/ci.yml`](./.github/workflows/ci.yml) runs on push to `main`/`master` and on pull requests. Today: `lint` + `build` + `test`.

When adding tests, uncomment the matching job in that file (do not invent a second workflow):

- Phase B: **done** - `test` job is live; it needs GitHub secret `DATABASE_URL_TEST` (dedicated Neon ci branch, not production) and serializes all database test jobs with the `orbit-database-tests` concurrency group
- Phase G: `e2e` job (`npx playwright install --with-deps chromium` then `npm run test:e2e`)
- Phase J: mark checks required; document secrets and how to run tests in README

CI and local dev both run Node 24 (npm 11) - keep them on the same major. npm 10 and npm 11 handle optional peer dependencies differently: npm 10 auto-installs vite 8's optional `esbuild` peer and its `npm ci` rejects locks that lack the 27-entry `node_modules/vitest/node_modules/esbuild` subtree (`Missing: esbuild@0.28.2 from lock file`); npm 11 omits that subtree and accepts the lock either way, and plain `npm install` on npm 11 prunes the subtree if a lock contains it. So committed locks here are npm 11 output by design, and a failing `npx npm@10 ci` is expected version skew, not a defect to repair. Never commit a lock produced with peer/optional resolution disabled (`--legacy-peer-deps`, `--omit=optional`). If the CI Node version ever changes, re-verify the lock with that version's npm before pushing.

## App status

- Phase A complete: Next.js App Router + Tailwind + static Orbit shell (`components/orbit/AgendaShell.tsx`). UI reference: `prototype/ui-prototype.html`.
- Phase B complete: Drizzle schema (`lib/db/schema.ts`), migrations (`drizzle/`), seed helper (`lib/db/seed.ts`), Vitest harness (`tests/`). Diagrams and constraint catalogue: [`docs/data-model.md`](./docs/data-model.md).
  - Task vs Monthly separation is enforced **in the database**, not only in services: `section` carries a `unique(id, space_id, kind)`, and `task` / `monthly` / `note` each mirror `section_kind` behind a composite foreign key plus a `CHECK` restricting the legal kinds. Inserting a Task into Monthlies (or a Monthly anywhere else, or a row pointing at another Space's Section) raises a constraint error.
  - Services must set `sectionKind` alongside `sectionId` when writing Tasks, Monthlies, and Notes.
- Phase C complete: Better Auth (`lib/auth.ts`, `app/api/auth/[...all]`), Resend verification and password-reset mail (`lib/email/`, `emails/`), auth pages under `app/(auth)/`, protected shell under `app/(app)/`, Personal Space onboarding (`lib/onboarding.ts`), suite in `tests/auth/`.
  - The gate lives in `lib/auth-access.ts` / `lib/session.ts`: `requireVerifiedSession()` redirects to `/sign-in` when there is no session and to `/verify-email` when an email/password user has not verified. OAuth counts as verified, so a Google or Microsoft account row satisfies the gate on its own (spec §3).
  - `(app)/layout.tsx` runs onboarding; pages re-check the session themselves because a layout does not re-render on client navigation.
  - One Personal Space per user is enforced **in the database** (`space_personal_creator_unique`, migration `0001`), so `ensurePersonalSpace()` is safe to call on every request.
  - The creator's IANA zone reaches the server through the `orbit_tz` cookie that the auth pages set (`components/auth/TimeZoneCookie.tsx`); it falls back to UTC (ADR 0003).
  - All outbound mail goes through `sendEmail()` in `lib/email/mailer.ts`. Tests mock that module. Without `RESEND_API_KEY` / `EMAIL_FROM` it logs the message in dev and throws in production.
  - Password pages: email-token reset at `/reset-password` (usable signed out); signed-in change-password at `/change-password`, gated by `requireVerifiedSession()`.
- Phase D complete: domain services + authz live under `lib/services/` and `lib/authz/`; service errors carry stable domain error codes for the API boundary.
  - Reminder delivery serializes the candidate check, email send, and `notification_log` write with a transaction-scoped PostgreSQL advisory lock; the same candidate key is passed to Resend for cross-call idempotency.
- Phase E in progress: E1 complete. `lib/api/validation.ts` parses JSON bodies and query parameters through Zod; `lib/api/errors.ts` exposes the stable `{ error: { code, message, issues? } }` JSON envelope, maps authz/domain errors to HTTP statuses, and hides unexpected error details. Route Handlers should use `apiErrorResponse` at their catch boundary.
- Next: Phase E2 (Spaces CRUD and timezone patch).


<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
