# Orbit - agent notes

## Sources of truth

1. [`CONTEXT.md`](./CONTEXT.md) - vocabulary + product overview
2. [`docs/spec.md`](./docs/spec.md) - MVP requirements
3. [`docs/adr/`](./docs/adr/) - hard decisions
4. [`Orbit_Test_Plan.md`](./Orbit_Test_Plan.md) - what to test
5. [`Orbit_Granular_Build.md`](./Orbit_Granular_Build.md) - phase status / handoffs (if still building)

Prefer CONTEXT terms (Space, Task, Monthly, Note, Active Space, Reminder, Invite). Do not invent synonyms.

## Architecture

- **Auth**: web RSC uses `lib/auth/session.ts`; API routes use `lib/rest-api/auth.ts`. Do not mix them. Better Auth production rate limits use `rate_limit` (`storage: "database"`). That Drizzle model must expose `id` (PK) plus unique `key` - the adapter inserts `id` on every bucket write, and rate limiting is on by default only when `NODE_ENV=production`. Env vars on Vercel do not apply schema changes; after `npm run db:generate`, migrate the production Neon branch (`DRIZZLE_DATABASE_URL` = that URL, then `npm run db:migrate`).
- **Active Space views**: `getActiveSpace(spaceId)` from `lib/spaces/active-space.ts` (layout data + Viewer). Do not call `requireVerifiedSession` / `requireMembership` or re-declare `[spaceId]` params in those views. Services enforce membership at the API boundary.
- **Params**: `resolveSpaceContext` in `lib/spaces/params.ts` is the only `[spaceId]` params schema.
- **Onboarding**: Personal Space via `resolveEntrySpace` in `lib/onboarding.ts`; the app layout only session-guards. Layouts and pages render concurrently.
- **Actions** (`lib/actions/`): web-only (ADR 0005). Thin wrappers over `lib/services` - no business logic. Always use `defineAction` from `lib/actions/framework.ts`. Alias service imports so action names do not collide with the service they wrap. Monthly `body` defaults to `""` (UI label Description). Task due dates, Monthly body, and content delete use existing Server Actions and existing Monthly REST handlers - do not add new REST routes for them.
- **IDs**: app entities are UUIDs; Better Auth `user.id` is a 32-char alphanumeric string. Fields that hold a user ID (`assigneeId`, `completedBy`, ...) use `z.string().min(1)`, never `z.uuid()`.

## Active Space UI

- `components/spaces/` owns Active Space chrome. RSC: `getActiveSpace`; client: `useActiveSpace()` from `ActiveSpaceProvider`.
- Route groups under `app/(app)/spaces/`:
  - `(directory)/` owns `/spaces` and its `loading.tsx`. Never put directory loading at `spaces/loading.tsx` (it would wrap Active Space navigations).
  - `(active)/` keeps the sidebar across `spaceId` changes. `(active)/loading.tsx` is a main-panel spinner only - no second sidebar.
  - Section routes own their own `loading.tsx`. Do not add `[spaceId]/loading.tsx` (flashes a generic skeleton on tab switches).
- Sidebar is Spaces-only and `position: fixed` (`SpaceSidebarShell` + `lg:pl-[var(--sidebar-w)]` on main). Sections live in `SectionTabs` inside `SpaceLayout`; Section pages render content only.
- URLs: system views `/spaces/[spaceId]/{upcoming|daily|monthlies}`; custom Sections `/spaces/[spaceId]/[sectionId]` (UUID). Static siblings win over the dynamic segment.

## Auth / Invites

- Invite tokens: store only SHA-256 digests (`invite.token_digest`). Generate/hash via `lib/invites/token.ts` - never persist raw bearers.
- Invite continuation: validated local `/accept-invite?token=...` only (`parseLocalContinuation`). Pages with `searchParams` use `continuationFromSearchParams`. Post-auth callbacks go through `/` so Personal Space onboarding runs before returning to the Invite. After a successful `acceptInvite` write, the action `redirect()`s to Upcoming with the write result's `spaceId` (do not re-read memoized membership in the same request, and do not `window.location.assign` after the action - that aborts the RSC stream and flashes `app/error.tsx`). Auth layout and `/` use `referrer: "no-referrer"` so tokens in `continue` do not leak via Referer.

## Testing and CI

- Vitest: real Neon via `DATABASE_URL_TEST` (dedicated branch, never production). No SQLite. Suite drops/recreates `public` before migrating. `maxWorkers: 1` plus an advisory lock - do not run parallel full suites against the same branch.
- E2E: `DATABASE_URL_E2E` + `DATABASE_URL_E2E_CONFIRMATION` (`dedicated-neon-branch`). No fallback to `DATABASE_URL` / `DATABASE_URL_TEST`. After schema changes, migrate the e2e branch too (`DRIZZLE_DATABASE_URL` = e2e URL, then `npm run db:migrate`).
- Prefer domain/service tests; keep Route Handlers and Actions thin.
- Authz: Owner-only proofs need an **editor** actor (read-only 403 is not enough). Entity fetches need a cross-Space IDOR case. `authorization-contract.test.ts` is a completeness net - it does not replace editor-actor 403s in domain tests.
- API / action tests: import `tests/setup/api-mocks.ts` first (then `action-mocks.ts` for actions) so mocks register before handlers.
- E2E auth POSTs need a trusted `Origin` (`BETTER_AUTH_URL` / `http://localhost:3000`) or they fail with `MISSING_OR_NULL_ORIGIN`. Invite E2E pins a known bearer via `e2e/helpers` and flips `email_verified` in the DB (no inbox). Playwright clears Resend env; Vitest mocks `@/lib/email/mailer`.
- Schema: edit `lib/db/schema.ts`, then `npm run db:generate` / `npm run db:migrate`.
- CI: single workflow [`.github/workflows/ci.yml`](./.github/workflows/ci.yml). Secrets: `DATABASE_URL_TEST`, `DATABASE_URL_E2E`.

If `npm test` hangs before listing files, a killed Vitest run may still hold advisory lock `0x4f524249` on the test branch - clear leftover local Vitest processes and only idle/stuck backends holding that lock.


<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos, the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
