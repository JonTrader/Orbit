# Orbit

Household-first coordination app for day-to-day to-dos and recurring monthly obligations, with optional personal Spaces.

Use the terms in [CONTEXT.md](./CONTEXT.md): Space, Task, Monthly, Note, Active Space, Reminder, Activity, Invite. Do not invent synonyms.

Domain behavior is [docs/spec.md](./docs/spec.md). Hard decisions are [docs/adr/](./docs/adr/).

## Auth and entry

- Web RSC sessions use `lib/auth/session.ts`. API routes use `lib/rest-api/auth.ts`. Do not mix them.
- `verification.storeIdentifier` hashes `email-verification` and `reset-password` identifiers. The reset prefix is `reset-password`. Tests that look up those rows must hash the identifier the same way.
- Guests and verified sessions both see `/`. Do not auto-redirect either into Spaces. Verified CTAs go to entry-Space Upcoming via `resolveEntrySpace`. Post-auth callbacks use `/spaces`, which onboards and then opens entry-Space Upcoming unless returning to an Invite. Unverified sessions go to `/verify-email`.
- `resolveEntrySpace` (`lib/onboarding.ts`) returns the first membership by creation order. It creates a Personal Space only when the user has none.
- Invite bearers are stored only as a SHA-256 digest in `invite.token_digest`. Generate and hash them in `lib/invites/token.ts`. Email links are `/accept-invite?token=...`. `proxy.ts` stashes a legal bearer in the HttpOnly `orbit_invite` cookie and redirects to bare `/accept-invite`. An illegal bearer is stripped and is not stored. Accept reads and clears that cookie, never a client-supplied bearer.
- Invite `continue` is the bare `/accept-invite` path. Preserve it on guest CTAs and `/verify-email`. Legacy `?token=` continue values are canonicalized to that bare path. Pages with `searchParams` use `continuationFromSearchParams`.
- After `acceptInvite` succeeds, `redirect()` to Upcoming with the write result's `spaceId`. Do not re-read memoized membership in that request. Do not `window.location.assign` after the action. That aborts the RSC stream and flashes `app/error.tsx`.
- Auth layout and `/` use `referrer: "no-referrer"`.
- Brand icons live in `public/icons/` and are wired through `metadata.icons` in `app/layout.tsx`. Do not add `app/icon.*` or `app/favicon.ico`.

## Active Space

- Pages use `getActiveSpace(spaceId)` from `lib/spaces/active-space.ts`. Do not call `requireVerifiedSession` or `requireMembership` in those views, and do not declare a `[spaceId]` params schema. `resolveSpaceContext` in `lib/spaces/params.ts` is the only one. The `(app)` layout only session-guards. Services enforce membership.
- Do not add `spaces/loading.tsx` or `[spaceId]/loading.tsx`. Directory loading belongs on `(directory)/all/loading.tsx`. `(active)/loading.tsx` is a main-panel spinner only, with no second sidebar. Section routes own their own `loading.tsx`.
- System views are `/spaces/[spaceId]/{upcoming|daily|monthlies}`. Custom Sections are `/spaces/[spaceId]/[sectionId]`. Static siblings win over the dynamic segment.
- `/spaces/all` Home opens entry-Space Upcoming, not `/`.
- Client chrome reads `useActiveSpace()`. The Assignee picker uses `members` already on that value. The Reminders dialog reads the Viewer's preference from the layout. Do not fetch those on open. History and Activity load when their dialogs open. Do not put the Activity feed on `getSpaceLayoutData`, and do not add an Activity nav item.

## Actions, ids, and dates

- App entity ids are UUIDs. Better Auth `user.id` is a 32-character alphanumeric string. User id fields (`assigneeId`, `completedBy`, and the rest) use `z.string().min(1)`, never `z.uuid()`.
- Server Actions are thin wrappers over `lib/services` with no business logic. Use `defineAction` from `lib/actions/framework.ts`. Alias service imports so the action name does not collide with the service.
- Do not add REST routes for flows the spec keeps on existing Server Actions and existing handlers: Task due dates, Monthly body, content delete, Invite cancel, Activity reads, and a second Task move.
- Space due-day clamp, advancing a Monthly one period, Reminder day offsets (including the 3-day Task lookback), and the short date label live in `lib/calendar-date.ts`.

## Activity

- `recordActivity` in `lib/services/activity.ts` is the only writer. It does not check membership and does not open a transaction. Callers pass an `OrbitExecutor` (`OrbitDb | OrbitTx` from `lib/db/client.ts`) so the insert shares their transaction. Route handlers, Server Actions, and React components do not write Activity.
- Same-Section `moveTask`, `reorderCustomSections`, and an update whose supplied values already match the stored row write no Activity. A Monthly due day that already matches is not an Activity change when `nextDueOn` is recomputed.
- `deleteCustomSection` writes `deleted` Activity for each child (`cause: "section_deleted"`) and for the Section, then deletes the Section so the cascade removes the children. It does not call `deleteTask` or `deleteNote`.
- `listActivity` and `listEntityActivity` are Server Actions with `revalidate: false`.

## Reminders

`sendReminders` is one hourly UTC cron, served at `app/api/inngest/route.ts` with no session check. It calls `scanReminderCandidates`, then `sendReminder` per candidate. Domain rules stay in `lib/services/notifications.ts`. Local dev sets `INNGEST_DEV=1` and runs `npx inngest-cli@latest dev`.

## Schema

- Edit `lib/db/schema.ts`, then `npm run db:generate`, and commit the migration. Migrate the e2e branch only when that task needs it (`DRIZZLE_DATABASE_URL` set to the e2e URL, then `npm run db:migrate`). Vitest migrates the test branch itself. Migrate production only when you explicitly ask.
- The Better Auth `rate_limit` model (`storage: "database"`) must expose `id` (primary key) and a unique `key`. The adapter inserts `id` on every bucket write. Rate limiting is on by default only when `NODE_ENV=production`.

## Tests and CI

- Vitest uses `DATABASE_URL_TEST`, a dedicated Neon branch, never production. No SQLite. The suite drops and recreates `public`, then migrates. `maxWorkers: 1` plus an advisory lock. Do not run parallel full suites against the same branch. If `npm test` hangs before listing files, a leftover process may still hold advisory lock `0x4f524249`.
- Owner-only proofs need an editor actor. A read-only 403 is not that proof. Entity fetches need a cross-Space IDOR case. `authorization-contract.test.ts` does not replace those tests.
- API and action tests import `tests/setup/api-mocks.ts` first, then `action-mocks.ts` for actions. Vitest mocks `@/lib/email/mailer`.
- Playwright uses `DATABASE_URL_E2E` and `DATABASE_URL_E2E_CONFIRMATION` only. No fallback to `DATABASE_URL` or `DATABASE_URL_TEST`. Auth POSTs need a trusted `Origin` (`BETTER_AUTH_URL` or `http://localhost:3000`). Invite E2E pins a bearer through `e2e/helpers` and flips `email_verified` in the database. Playwright clears the Resend env.
- CI is the single workflow `.github/workflows/ci.yml`. Secrets are `DATABASE_URL_TEST` and `DATABASE_URL_E2E`.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
