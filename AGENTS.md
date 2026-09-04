# Orbit - agent notes

## Read order

1. [`CONTEXT.md`](./CONTEXT.md) - vocabulary + product overview
2. [`docs/spec.md`](./docs/spec.md) - MVP requirements (stack, API shape, product rules)
3. [`docs/adr/`](./docs/adr/) - hard decisions
4. [`Orbit_Granular_Build.md`](./Orbit_Granular_Build.md) - one phase per conversation (copy that phase's handoff prompt)
5. [`Orbit_Test_Plan.md`](./Orbit_Test_Plan.md) - what to test for the phase you are implementing

## Domain language

Prefer CONTEXT terms (Space, Task, Monthly, Note, Active Space, Reminder, Invite). Do not invent synonyms.

## Service layout

- `lib/auth/session.ts` - web RSC session helpers. `getAppSession()` is React-cached per render pass. `requireVerifiedSession()` and `requireCredentialSession()` call `resolveAppAccess` from `lib/auth/access.ts` directly (no intermediate wrapper). `requireCredentialSession` is the single credential decision point for password management (redirects OAuth-only users); the `(active)` Space shell reads `canChangePassword` via `hasCredentialAccount` (user-level, not Space-scoped). `redirectIfVerified()` reads the session directly and redirects only when signed in and verified; used on sign-in, sign-up, and verify-email. API routes use `lib/rest-api/auth.ts` instead.
- `lib/services/notifications.ts` - Reminder candidate scanning / sending only.
- `lib/services/notification-preferences.ts` - per-user per-Space preference CRUD. Read-only Members may update their own preferences.
- `lib/spaces/viewer.ts` - RSC-only Viewer / layout-data resolution (see CONTEXT.md "Viewer"). Tests: `tests/lib/spaces/viewer.test.ts`.
  - `resolveSpaceContext(params)` is the single params schema for every `[spaceId]` route; malformed ids 404.
  - `getSpaceLayoutData(spaceId)` is the one-query layout loader: space + membership role + credential `EXISTS` + Sections `json_agg` + ShareBar member preview `json_agg`. Returns `{ viewer, sections, members }`. Prefer `getActiveSpace(spaceId)` from `lib/spaces/active-space.ts` in layout and pages (facade over the layout load; also carries `members`).
  - `getSpaceViewer` / `getSpaceSections` are thin wrappers over `getSpaceLayoutData` for callers that only need one slice; they share the same React cache / SQL round trip.
  - Viewer shape: `{ userId, user: { name, email }, space, role, can }` with `can.mutateContent` (editor+), `can.manageMembers` (owner), and `can.changePassword` (credential account).
  - Failure modes: unknown Space -> `notFound()`, non-member -> redirect to `/`, unverified -> session-guard redirect.
  - `ShareBarSlot` reads layout `members` from the route layout; it must not call `listMembers` on render. `listMembers` remains for API / mutation paths.
  - Pages and layouts must use this module (via `getActiveSpace`) instead of calling `requireVerifiedSession`, `requireMembership`, or re-declaring params schemas. It is the single session touchpoint for Space views; services keep their own membership checks for the API boundary.
- `lib/spaces/queries/` - pure RSC content SELECTs (no auth). Prefer these after `getActiveSpace` on Space pages. `fetchUpcomingTimeline` is the Upcoming page's one content query (`UNION ALL` of Monthlies + dated open Tasks); Section names come from layout `sections` in memory, not a JOIN. `fetchMixedSectionContent` is the mixed custom Section's one content query (two `json_agg` subqueries for Tasks + Notes - not UNION, different row shapes). Keep `fetchTasks` / `fetchMonthlies` / `fetchNotes` for Daily, Monthlies, single-kind custom sections, and for services wrapping API routes.
- Layouts and pages render **concurrently** in the App Router. Onboarding (Personal Space creation) is owned by the entry route via `resolveEntrySpace` in `lib/onboarding.ts`; the app layout only session-guards.

## Action layout

- `lib/actions/` - web-only Server Actions (ADR 0005). Thin wrappers over `lib/services`; no business logic.
- Build every action with `defineAction(schema, handler)` from `lib/actions/framework.ts`. It owns the verified-session guard, schema validation, `{ userId, db }` injection, Space layout revalidation, and error mapping. Do not hand-roll that sequence.
- Actions resolve to `ActionResult<T>` from `lib/actions/result.ts` (`{ ok: true, data } | { ok: false, error }`). Error codes match the `/api/v1` envelope because both boundaries map the same `DomainError`s.
- Action tests (`tests/actions/`) import `tests/setup/api-mocks.ts` then `tests/setup/action-mocks.ts` first, use `authenticateAs(userId)` for signed-in callers and `guardRedirectsTo(url)` for unauthenticated/unverified ones, and assert `revalidatePath` calls. See `tests/actions/quick-add.test.ts` and `tests/actions/define-action.test.ts`.
- Avoid naming an action the same as the service function it wraps. Alias imports when needed (`renameSection as renameSectionService`).

## ID conventions

App tables (`space`, `section`, `task`, `monthly`, `note`, `invite`, ...) use `uuid` columns with `defaultRandom()`. But Better Auth generates `user.id` as 32-char alphanumeric (`a-z`, `A-Z`, `0-9`), not a UUID (`lib/auth/config.ts` sets no custom `generateId`). Any API schema field that holds a user ID (`assigneeId`, `completedBy`, ...) must validate with `z.string().min(1)`, never `z.uuid()`.

## Component layout

- `components/spaces/` owns the Active Space chrome and rows:
  - `ActiveSpaceProvider.tsx` - client context for the Active Space (`useActiveSpace()`). The `[spaceId]` layout wraps children after resolving layout data once (`viewer`, `sections`, `members`); client descendants read from context. RSC pages cannot use the hook and call `getActiveSpace(spaceId)` from `lib/spaces/active-space.ts` instead.
  - Route groups under `app/(app)/spaces/`: `(directory)/` owns `/spaces` (`page.tsx` / `loading.tsx` - directory skeleton only; that loading must not sit at `spaces/loading.tsx` or it wraps Active Space navigations too). `(active)/` wraps Active Space routes so the sidebar persists across `spaceId` changes. `(active)/loading.tsx` is a main-panel spinner shown as `{children}` inside `SpaceSidebarShell` while `[spaceId]` chrome resolves; it must not include a sidebar, because the layout already rendered one. Section `loading.tsx` files only cover the content panel after `[spaceId]` chrome is mounted. There is no `[spaceId]/loading.tsx`: that parent fallback flashed a generic skeleton before the destination Section skeleton on tab switches.
  - `SpaceSidebarShell.tsx` - client frame used by `spaces/(active)/layout.tsx`. Owns the grid, mobile drawer state, and `SpaceSidebar` (with streamed `spacesSlot`). Exposes `useOpenSidebar()` for the mobile Spaces button in `SpaceLayout`.
  - `SpaceLayout.tsx` - client main panel used by `spaces/(active)/[spaceId]/layout.tsx`. Renders the Active Space header, `SectionTabs`, `AddSectionButton`, `{children}`, and `shareBarSlot`.
  - `SpaceSidebar.tsx` / `SidebarHeader.tsx` / `SpaceRailLinks.tsx` / `SpaceOrbit.tsx` / `SidebarFooter.tsx` - sidebar breakdown. The sidebar is Spaces-only (orbit rail rows with active dot); Sections live in `SectionTabs` only. `SpaceRailLinks` is the client Space list deriving active state from `usePathname()` and takes an optional `onClick` (used to close the mobile sidebar). `SidebarNavLinks.tsx` remains for plain link lists if needed elsewhere.
  - `SectionTabs.tsx` - client tab strip; derives the active tab from `usePathname()` and takes only `items`. Do not render it inside section pages - it lives in `SpaceLayout`, and section pages render content only.
- Section URLs: system views at `/spaces/[spaceId]/{upcoming|daily|monthlies}`; custom Sections at `/spaces/[spaceId]/[sectionId]` (UUID). Static siblings win over the dynamic segment. Each section route has its own `loading.tsx` skeleton matching that page's anatomy; the layout renders the nav chrome during streaming, so skeletons cover the content panel only. Do not add a `[spaceId]/loading.tsx`; it wraps every child segment and flashes a generic skeleton before the destination Section one on tab switches. The bare `/spaces/[spaceId]` page only redirects to Upcoming and does not need a content skeleton.

## Testing

Source of truth: [`Orbit_Test_Plan.md`](./Orbit_Test_Plan.md).

Prefer domain/service tests for business rules; keep Route Handlers and Server Actions thin. User-visible bugs get a Playwright repro when practical.

Stack: Vitest + real Neon Postgres via `DATABASE_URL_TEST`. No SQLite stand-in.

### Running the suite

```
npm test          # everything
npm run test:db   # db suite only
npm run test:auth # auth suite only
npm run test:watch
```

`DATABASE_URL_TEST` must point at a **dedicated Neon branch**, never production: the run drops and recreates the `public` schema before migrating. Test files share that one branch, so `vitest.config.mts` disables file parallelism, sets `maxWorkers: 1`, and each file seeds its own fixtures after `truncateAll()`. Never run full suites concurrently against the same branch. `tests/setup/global-setup.ts` holds a Postgres advisory lock (`TEST_DB_LOCK_KEY`) for the entire `npm test` run so CI jobs and local runs cannot interleave schema resets. Service tests that spy on shared modules (e.g. `requireMembership`) must use `vi.spyOn` + `vi.restoreAllMocks()` in `afterEach`, not `vi.mock` on `@/lib/spaces/membership`.

Migrations live in `drizzle/`; regenerate with `npm run db:generate` after editing `lib/db/schema.ts` and apply with `npm run db:migrate`.

### API test helpers

- `tests/setup/api-mocks.ts` - `vi.mock` for `@/lib/auth` and `@/lib/db/client`. Import this **first** in any API test file so the mocks are registered before Route Handler imports.
- `tests/setup/api.ts` - shared helpers: `authenticateAs`, `unauthenticate`, `jsonRequest`, `responseJson`, route context builders, `ErrorBody`, and `apiTestLifecycle`.
- Each API test file still owns its `beforeAll`/`beforeEach` wiring via `apiTestLifecycle()`.

### E2E helpers

- `e2e/helpers.ts` creates users via Better Auth HTTP endpoints. Auth POSTs must send a trusted `Origin` (see `BETTER_AUTH_URL` / `http://localhost:3000`): once the Playwright `request` fixture holds cookies from a prior sign-in, Better Auth rejects cookie-bearing auth calls with `MISSING_OR_NULL_ORIGIN`.

## CI

[`.github/workflows/ci.yml`](./.github/workflows/ci.yml) defines the CI pipeline. When adding tests, enable the matching job in that file rather than creating a second workflow. The `test` job needs the GitHub secret `DATABASE_URL_TEST` (dedicated Neon branch, not production).

## Project status

Completed phases and the current handoff prompt are tracked in [`Orbit_Granular_Build.md`](./Orbit_Granular_Build.md).


<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
