# Orbit — agent notes

## Read order

1. [`CONTEXT.md`](./CONTEXT.md) - vocabulary only  
2. [`docs/spec.md`](./docs/spec.md) - MVP requirements (stack, API shape, product rules)  
3. [`docs/adr/`](./docs/adr/) - hard decisions  
4. [`.cursor/plans/orbit_granular_build_818e051.plan.md`](./.cursor/plans/orbit_granular_build_818e051.plan.md) - one phase per conversation (copy that phase's handoff prompt)

## Domain language

Prefer CONTEXT terms (Space, Task, Monthly, Note, Active Space, Reminder, Invite). Do not invent synonyms.

## Product spine (MVP)

Household-first coordination: Daily Tasks vs Monthlies as separate domains, Space-level sharing/RBAC, Upcoming as a read-only view, email Reminders via Inngest + Resend. Dual API: `/api/v1` Route Handlers + web Server Actions over shared domain services.

## App status

- Phase A complete: Next.js App Router + Tailwind + static Orbit shell (`components/orbit/AgendaShell.tsx`). UI reference: `ui-prototype.html`.
- Next: Phase B (Drizzle schema).

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
