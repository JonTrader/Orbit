# Orbit - agent notes

## Read order

1. [`CONTEXT.md`](./CONTEXT.md) - vocabulary + product overview
2. [`docs/spec.md`](./docs/spec.md) - MVP requirements
3. [`docs/adr/`](./docs/adr/) - hard decisions
4. [`Orbit_Granular_Build.md`](./Orbit_Granular_Build.md) - one phase per conversation (copy that phase's handoff prompt)
5. [`Orbit_Test_Plan.md`](./Orbit_Test_Plan.md) - what to test for the phase you are implementing

## Domain language

Prefer CONTEXT terms (Space, Task, Monthly, Note, Active Space, Reminder, Invite). Do not invent synonyms.

## Auth and Space views

- Web RSC session: `lib/auth/session.ts`. API routes: `lib/rest-api/auth.ts`. Do not mix them.
- Space pages/layouts: use `getActiveSpace(spaceId)` from `lib/spaces/active-space.ts` (layout data + Viewer). Do not call `requireVerifiedSession` / `requireMembership` or re-declare `[spaceId]` params schemas in those views. Services still enforce membership at the API boundary.
- Params: `resolveSpaceContext` in `lib/spaces/params.ts` is the single `[spaceId]` params schema.
- Onboarding (Personal Space): entry route via `resolveEntrySpace` in `lib/onboarding.ts`; the app layout only session-guards. Layouts and pages render concurrently.

## Actions

- `lib/actions/` - web-only Server Actions (ADR 0005). Thin wrappers over `lib/services`; no business logic.
- Build every action with `defineAction` from `lib/actions/framework.ts`. Do not hand-roll session / validation / revalidate / error mapping.
- Avoid naming an action the same as the service it wraps; alias the service import.

## ID conventions

App entities use UUIDs. Better Auth `user.id` is a 32-char alphanumeric string, not a UUID. Schema fields that hold a user ID (`assigneeId`, `completedBy`, ...) must use `z.string().min(1)`, never `z.uuid()`.

## Active Space UI footguns

- `components/spaces/` owns Active Space chrome. RSC pages use `getActiveSpace`; client descendants use `useActiveSpace()` from `ActiveSpaceProvider`.
- Route groups under `app/(app)/spaces/`:
  - `(directory)/` owns `/spaces` (including its `loading.tsx`). Do not put directory loading at `spaces/loading.tsx` - it would wrap Active Space navigations.
  - `(active)/` keeps the sidebar across `spaceId` changes. `(active)/loading.tsx` is a main-panel spinner inside the already-rendered sidebar shell - do not include a second sidebar there.
  - Section routes own their own `loading.tsx` (content panel only). Do not add `[spaceId]/loading.tsx` - it flashes a generic skeleton before the destination Section skeleton on tab switches.
- Sidebar is Spaces-only; Sections live in `SectionTabs` inside `SpaceLayout`. Section pages render content only - do not re-render `SectionTabs` there.
- URLs: system views at `/spaces/[spaceId]/{upcoming|daily|monthlies}`; custom Sections at `/spaces/[spaceId]/[sectionId]` (UUID). Static siblings win over the dynamic segment.

## Testing

Source of truth: [`Orbit_Test_Plan.md`](./Orbit_Test_Plan.md).

- Vitest + real Neon via `DATABASE_URL_TEST` (dedicated branch, never production). No SQLite. The suite drops/recreates `public` before migrating.
- E2E (`npm run test:e2e`) uses its own Neon branch via `DATABASE_URL_E2E` + `DATABASE_URL_E2E_CONFIRMATION` (same confirmation value `dedicated-neon-branch`). It does not fall back to `DATABASE_URL` or `DATABASE_URL_TEST`. CI migrates that branch before Playwright; locally set `DRIZZLE_DATABASE_URL` to the e2e URL and run `npm run db:migrate` after schema changes.
- No parallel full Vitest suites against the same branch (`maxWorkers: 1`; advisory lock in global setup). Prefer domain/service tests; keep Route Handlers and Actions thin.
- Orphaned advisory locks: if `npm test` hangs before printing files, a killed Vitest run may still hold key `0x4f524249` on `DATABASE_URL_TEST` (Neon pooler sessions can outlive the local process). Kill leftover local Vitest `node` processes, then terminate only backends holding that lock (`pg_locks` where `locktype = 'advisory'` and `objid = 1330790985`) that are idle or stuck on `Neon/RelExists`. Do not terminate unrelated active backends.
- Authz footguns: Owner-only tests need an **editor** actor (read-only 403 does not prove Owner-only). Entity fetches need a cross-Space IDOR case (`spaceId` A + entity id from Space B).
- Authz contract (`tests/services/authorization-contract.test.ts`) is a completeness net: mutating and gated-read services call `requireMembership` with the right min role. It does not replace editor-actor 403s in domain tests.
- API / action tests: import `tests/setup/api-mocks.ts` first (then `action-mocks.ts` for actions) so mocks register before handlers. See `tests/setup/api.ts` and existing action tests for patterns.
- E2E auth POSTs need a trusted `Origin` (`BETTER_AUTH_URL` / `http://localhost:3000`); cookie-bearing auth calls without Origin fail with `MISSING_OR_NULL_ORIGIN`.
- Invite tokens: only SHA-256 digests are stored (`invite.token_digest`). Hash/generate via `lib/invites/token.ts` (`hashInviteToken`, `newInviteBearerToken`) - not from `members.ts` in Playwright. Raw bearers live in email links / accept URLs. E2E pins a known raw token onto the pending row via `e2e/helpers` (`pinInviteBearerToken`) and flips `email_verified` in the DB - it does not read an inbox. Playwright's webServer clears `RESEND_API_KEY` / `EMAIL_FROM` so local `.env` Resend credentials are not used (same as CI). Vitest mocks `@/lib/email/mailer`. Do not persistently cache bearer-token previews or recipient-specific Invite data.

- Invite continuation: validated local `/accept-invite?token=...` only (`parseLocalContinuation`). Pages with `searchParams` use `continuationFromSearchParams` rather than unwrapping `continue` themselves. Post-auth callbacks go through `/` so Personal Space onboarding runs, then return to the Invite. After `acceptInvite`, redirect with the write result's `spaceId` - do not re-read memoized membership in the same request. The accept client uses `window.location.assign` (not `router.replace`, and not inside `startTransition`) to Upcoming so an RSC refresh of `/accept-invite` cannot race the navigation. Auth layout and `/` export `referrer: "no-referrer"` so Invite tokens in `continue` do not leak via Referer.
- Schema changes: edit `lib/db/schema.ts`, then `npm run db:generate` / `npm run db:migrate`. After schema changes, also migrate `DATABASE_URL_E2E` (`DRIZZLE_DATABASE_URL` = e2e URL) before Playwright.

## CI / status

- CI: [`.github/workflows/ci.yml`](./.github/workflows/ci.yml). Add jobs there; do not create a second workflow. `test` needs secret `DATABASE_URL_TEST`; `e2e` needs secret `DATABASE_URL_E2E`.
- Phase status and handoff prompts: [`Orbit_Granular_Build.md`](./Orbit_Granular_Build.md).


<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
