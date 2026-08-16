# Orbit - agent notes

## Read before coding

1. [`CONTEXT.md`](./CONTEXT.md) - vocabulary only
2. [`docs/spec.md`](./docs/spec.md) - MVP requirements, stack, API shape, and product rules
3. [`docs/adr/`](./docs/adr/) - hard architectural decisions
4. [`Orbit_Granular_Build.md`](./Orbit_Granular_Build.md) - phase handoff
5. [`Orbit_Test_Plan.md`](./Orbit_Test_Plan.md) - phase test requirements

If a phase is being implemented, read its handoff and test-plan sections before coding.

## Domain language

Prefer the established terms: Space, Task, Monthly, Note, Active Space, Reminder, and Invite. Do not invent synonyms.

## Product spine

Orbit is household-first coordination for Daily Tasks and Monthlies. Spaces provide sharing and RBAC. Upcoming is read-only. Reminders use Inngest and Resend. The web uses Server Actions over shared domain services; `/api/v1` Route Handlers are the mobile-ready API surface.

## Testing requirements

- Add feature and business-rule tests in the same phase as the implementation.
- Keep earlier phase suites passing. Do not delete, skip, or weaken existing security coverage.
- Prefer domain/service tests for business rules and keep Route Handlers and Server Actions thin.
- From Phase G onward, add Playwright coverage for practical user-visible bugs.
- The locked test stack is Vitest with real Neon Postgres from `DATABASE_URL_TEST`; Playwright begins in Phase G. Do not use SQLite as a substitute.

### Commands

```text
npm test
npm run test:db
npm run test:auth
npm run test:watch
```

`DATABASE_URL_TEST` must be a dedicated Neon branch and must never equal `DATABASE_URL`. The test setup drops and recreates the `public` schema, so do not run separate test processes concurrently against the shared test branch. Each test file seeds its own fixtures after `truncateAll()`.

When changing `lib/db/schema.ts`, regenerate migrations with `npm run db:generate` and apply them with `npm run db:migrate`.

## CI and runtime

- `.github/workflows/ci.yml` runs lint, build, and test on pushes and pull requests.
- Phase B database tests are enabled and require the `DATABASE_URL_TEST` GitHub secret.
- Add the Phase G E2E job to the existing workflow when that phase is implemented. Do not create a second workflow.
- CI and local development use Node 24 with npm 11. Do not regenerate the lockfile with `--legacy-peer-deps` or `--omit=optional`.

## App status

- Phase A: Next.js App Router, Tailwind, and the static Orbit shell are complete. The visual reference is in `prototype/`.
- Phase B: Drizzle schema, migrations, seed helper, and Vitest harness are complete. The database enforces Task, Monthly, and Note Section-kind boundaries; services must provide `sectionKind` with related writes. See `docs/data-model.md` for details.
- Phase C: Better Auth, email verification, password reset, OAuth, protected app access, onboarding, and auth tests are complete.
  - `requireVerifiedSession()` protects the app. Pages re-check access because layouts do not re-render on every client navigation.
  - OAuth account creation persists `emailVerified: true` for configured Google and Microsoft accounts before the session reaches the app gate. This avoids an account lookup on every gated request.
  - OAuth providers are registered and shown only when both provider credentials are configured.
  - Better Auth uses the database-backed `rate_limit` table so sensitive endpoint limits are shared across serverless instances. `BETTER_AUTH_TRUSTED_ORIGINS` adds explicit preview or custom origins to the canonical `BETTER_AUTH_URL`.
  - All outbound mail goes through `sendEmail()` in `lib/email/mailer.ts`. Production requires `RESEND_API_KEY` and `EMAIL_FROM`; development fallback logs delivery metadata only.
  - Reset links move the token into the URL fragment before mail is sent. The client reads and scrubs the fragment with `history.replaceState`, and the reset page sets `Referrer-Policy: no-referrer`.
  - Password forms and Better Auth share `MIN_PASSWORD_LENGTH` from `lib/password-policy.ts`.
  - `/change-password` uses `requireCredentialSession()` and redirects OAuth-only users. The app shell hides the link when no credential account exists.
  - One Personal Space per user is enforced in the database. Onboarding is safe to run on every protected request.
  - The creator timezone is carried by the `orbit_tz` cookie and falls back to UTC, as specified by ADR 0003.

Next planned phase: Phase D, domain services and authorization.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes - APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` - verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
