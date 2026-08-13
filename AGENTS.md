# Orbit — agent notes

## Read order

1. [`CONTEXT.md`](./CONTEXT.md) - vocabulary only  
2. [`docs/spec.md`](./docs/spec.md) - MVP requirements (stack, API shape, product rules)  
3. [`docs/adr/`](./docs/adr/) - hard decisions  
4. [`.cursor/plans/orbit_granular_build_818e051.plan.md`](./.cursor/plans/orbit_granular_build_818e051.plan.md) - one phase per conversation (copy that phase's handoff prompt)  
5. [`.cursor/plans/orbit_full_test_plan_c8f79c43.plan.md`](./.cursor/plans/orbit_full_test_plan_c8f79c43.plan.md) - what to test for the phase you are implementing

## Domain language

Prefer CONTEXT terms (Space, Task, Monthly, Note, Active Space, Reminder, Invite). Do not invent synonyms.

## Product spine (MVP)

Household-first coordination: Daily Tasks vs Monthlies as separate domains, Space-level sharing/RBAC, Upcoming as a read-only view, email Reminders via Inngest + Resend. Dual API: `/api/v1` Route Handlers + web Server Actions over shared domain services.

## Testing (required per phase)

Source of truth: [`.cursor/plans/orbit_full_test_plan_c8f79c43.plan.md`](./.cursor/plans/orbit_full_test_plan_c8f79c43.plan.md).

When implementing **any** build phase (A–J):

1. Open that plan and read the **Phase X** section for the phase you are shipping (stack, layout, and **What to test**).
2. Implement those tests **in the same phase** as the feature code. Do not defer the suite to Phase J.
3. Treat the phase as incomplete until Acceptance **and** that phase's "What to test" items are green (Phase C OAuth browser click-through may stay manual as noted in the plan).
4. Keep earlier phases' suites passing; do not delete or skip B/D coverage when adding API or E2E later.
5. Prefer domain/service tests for business rules; keep Route Handlers and Server Actions thin. From Phase G, user-visible bugs get a Playwright repro when practical.

Stack (locked in the test plan): Vitest + real Neon Postgres via `DATABASE_URL_TEST` from Phase B; Playwright from Phase G. No SQLite stand-in.

### Running the suite

```
npm test        # everything
npm run test:db # Phase B db suite only
npm run test:watch
```

`DATABASE_URL_TEST` must point at a **dedicated Neon branch**, never production: the run drops and recreates the `public` schema before migrating. `tests/setup/env.ts` refuses to start when the variable is missing or equal to `DATABASE_URL`. Test files share that one branch, so `vitest.config.mts` disables file parallelism and each file seeds its own fixtures after `truncateAll()`.

Migrations live in `drizzle/`; regenerate with `npm run db:generate` after editing `lib/db/schema.ts` and apply with `npm run db:migrate`.

## CI

[`.github/workflows/ci.yml`](./.github/workflows/ci.yml) runs on push to `main`/`master` and on pull requests. Today: `lint` + `build` + `test`.

When adding tests, uncomment the matching job in that file (do not invent a second workflow):

- Phase B: **done** - `test` job is live; it needs GitHub secret `DATABASE_URL_TEST` (dedicated Neon ci branch, not production)
- Phase G: `e2e` job (`npx playwright install --with-deps chromium` then `npm run test:e2e`)
- Phase J: mark checks required; document secrets and how to run tests in README

## App status

- Phase A complete: Next.js App Router + Tailwind + static Orbit shell (`components/orbit/AgendaShell.tsx`). UI reference: `prototype/ui-prototype.html`.
- Phase B complete: Drizzle schema (`lib/db/schema.ts`), migrations (`drizzle/`), seed helper (`lib/db/seed.ts`), Vitest harness (`tests/`). Diagrams and constraint catalogue: [`docs/data-model.md`](./docs/data-model.md).
  - Task vs Monthly separation is enforced **in the database**, not only in services: `section` carries a `unique(id, space_id, kind)`, and `task` / `monthly` / `note` each mirror `section_kind` behind a composite foreign key plus a `CHECK` restricting the legal kinds. Inserting a Task into Monthlies (or a Monthly anywhere else, or a row pointing at another Space's Section) raises a constraint error.
  - Services must set `sectionKind` alongside `sectionId` when writing Tasks, Monthlies, and Notes.
- Next: Phase C (Better Auth; the `user` / `session` / `account` / `verification` tables already exist).


<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
