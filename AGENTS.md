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

- `lib/services/notifications.ts` - Reminder candidate scanning / sending only.
- `lib/services/notification-preferences.ts` - per-user per-Space preference CRUD. Read-only Members may update their own preferences.
- `lib/space-view.ts` - RSC-only Viewer resolution (see CONTEXT.md "Viewer"). Tests: `tests/lib/space-view.test.ts`.
  - `resolveSpaceContext(params)` is the single params schema for every `[spaceId]` route; malformed ids 404.
  - `getSpaceViewer(spaceId)` is React-cached per render pass and returns `{ userId, user: { name, email }, space, role, can }` with `can.mutateContent` (editor+) and `can.manageMembers` (owner).
  - `getSpaceSections(spaceId)` is the React-cached Section read for Space views. The layout and Daily / Monthlies / Upcoming pages call it instead of `listSections` directly so they share one query per render pass.
  - Failure modes: unknown Space -> `notFound()`, non-member -> redirect to `/`, unverified -> session-guard redirect.
  - Pages and layouts must use this module instead of calling `requireVerifiedSession`, `requireMembership`, or re-declaring params schemas. It is the single session touchpoint for Space views; services keep their own membership checks for the API boundary.

## Action layout

- `lib/actions/` - web-only Server Actions (ADR 0005). Thin wrappers over `lib/services`; no business logic.
- Build every action with `defineAction(schema, handler)` from `lib/actions/define-action.ts`. It owns the verified-session guard, schema validation, `{ userId, db }` injection, Space layout revalidation, and error mapping. Do not hand-roll that sequence.
- Actions resolve to `ActionResult<T>` from `lib/actions/result.ts` (`{ ok: true, data } | { ok: false, error }`). Error codes match the `/api/v1` envelope because both boundaries map the same `DomainError`s.
- Action tests (`tests/actions/`) import `tests/setup/api-mocks.ts` then `tests/setup/action-mocks.ts` first, use `authenticateAs(userId)` for signed-in callers and `guardRedirectsTo(url)` for unauthenticated/unverified ones, and assert `revalidatePath` calls. See `tests/actions/quick-add.test.ts` and `tests/actions/define-action.test.ts`.
- Avoid naming an action the same as the service function it wraps. Alias imports when needed (`renameSection as renameSectionService`).

## ID conventions

App tables (`space`, `section`, `task`, `monthly`, `note`, `invite`, ...) use `uuid` columns with `defaultRandom()`. But Better Auth generates `user.id` as 32-char alphanumeric (`a-z`, `A-Z`, `0-9`), not a UUID (`lib/auth.ts` sets no custom `generateId`). Any API schema field that holds a user ID (`assigneeId`, `completedBy`, ...) must validate with `z.string().min(1)`, never `z.uuid()`.

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

`DATABASE_URL_TEST` must point at a **dedicated Neon branch**, never production: the run drops and recreates the `public` schema before migrating. Test files share that one branch, so `vitest.config.mts` disables file parallelism and each file seeds its own fixtures after `truncateAll()`. Never run full suites concurrently against the same branch.

Migrations live in `drizzle/`; regenerate with `npm run db:generate` after editing `lib/db/schema.ts` and apply with `npm run db:migrate`.

### API test helpers

- `tests/setup/api-mocks.ts` - `vi.mock` for `@/lib/auth` and `@/lib/db/client`. Import this **first** in any API test file so the mocks are registered before Route Handler imports.
- `tests/setup/api.ts` - shared helpers: `authenticateAs`, `unauthenticate`, `jsonRequest`, `responseJson`, route context builders, `ErrorBody`, and `apiTestLifecycle`.
- Each API test file still owns its `beforeAll`/`beforeEach` wiring via `apiTestLifecycle()`.

## CI

[`.github/workflows/ci.yml`](./.github/workflows/ci.yml) defines the CI pipeline. When adding tests, enable the matching job in that file rather than creating a second workflow. The `test` job needs the GitHub secret `DATABASE_URL_TEST` (dedicated Neon branch, not production).

## Project status

Completed phases and the current handoff prompt are tracked in [`Orbit_Granular_Build.md`](./Orbit_Granular_Build.md).


<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
