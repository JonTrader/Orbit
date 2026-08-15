# Orbit data model

Physical schema as built in Phase B. Source of truth is [`lib/db/schema.ts`](../lib/db/schema.ts); migrations live in [`drizzle/`](../drizzle/). Vocabulary: [`CONTEXT.md`](../CONTEXT.md). Logical model: [`docs/spec.md`](./spec.md) §7.

## Map

Four clusters. Everything below `space` is deleted with it.

```mermaid
flowchart TB
  subgraph AUTH["Identity — Better Auth"]
    direction TB
    U["user"]
    SE["session"]
    AC["account"]
    VE["verification"]
  end

  subgraph ACCESS["Space and access"]
    direction TB
    SP["space<br/><i>name · timezone</i>"]
    SM["space_member<br/><i>owner | editor | read-only</i>"]
    IN["invite<br/><i>email · role · token · expiresAt</i>"]
  end

  subgraph CONTENT["Content"]
    direction TB
    SC["section<br/><i>daily | monthlies | tasks | notes | mixed</i>"]
    TK["task<br/><i>Daily + custom tasks/mixed</i>"]
    MO["monthly<br/><i>Monthlies only</i>"]
    NO["note<br/><i>notes/mixed · plain text</i>"]
  end

  subgraph NOTIFY["Reminders"]
    direction TB
    NP["notification_preference<br/><i>per user per Space</i>"]
    NL["notification_log<br/><i>idempotency key</i>"]
  end

  U --> SE
  U --> AC
  U --> SM
  SP --> SM
  SP --> IN
  SP --> SC
  SC --> TK
  SC --> MO
  SC --> NO
  U --> NP
  SP --> NP
  SP --> NL

  classDef auth fill:#eef2ff,stroke:#1d4ed8,stroke-width:1px,color:#1c1917
  classDef access fill:#fdeee4,stroke:#c2410c,stroke-width:1px,color:#1c1917
  classDef content fill:#e6f2f0,stroke:#0f766e,stroke-width:1px,color:#1c1917
  classDef notify fill:#f3ece0,stroke:#78716c,stroke-width:1px,color:#1c1917

  class U,SE,AC,VE auth
  class SP,SM,IN access
  class SC,TK,MO,NO content
  class NP,NL notify

  style AUTH fill:#faf6ef,stroke:#e7e0d4,color:#78716c
  style ACCESS fill:#faf6ef,stroke:#e7e0d4,color:#78716c
  style CONTENT fill:#faf6ef,stroke:#e7e0d4,color:#78716c
  style NOTIFY fill:#faf6ef,stroke:#e7e0d4,color:#78716c
```

`verification` stands alone — Better Auth keys it by email/token, not by `user.id`.

## Entities and columns

Every table carries `created_at` / `updated_at` (`timestamptz`, defaulted); they are omitted below for legibility.

```mermaid
erDiagram
  user ||--o{ session : "signs in"
  user ||--o{ account : "links provider"
  user ||--o{ space_member : "joins"
  user ||--o{ notification_preference : "configures"

  space ||--|{ space_member : "has"
  space ||--o{ invite : "offers"
  space ||--|{ section : "partitions"
  space ||--o{ notification_preference : "scopes"
  space ||--o{ notification_log : "records"

  section ||--o{ task : "holds"
  section ||--o{ monthly : "holds"
  section ||--o{ note : "holds"

  user {
    text id PK
    text name
    text email UK
    boolean email_verified "false until verified; OAuth counts as verified"
    text image
  }

  session {
    text id PK
    text token UK
    text user_id FK
    timestamptz expires_at
    text ip_address
    text user_agent
  }

  account {
    text id PK
    text user_id FK
    text account_id
    text provider_id "credential | google | microsoft"
    text password "email+password only"
    text access_token
    text refresh_token
    text id_token
    text scope
  }

  verification {
    text id PK
    text identifier
    text value
    timestamptz expires_at
  }

  space {
    uuid id PK
    text name
    text timezone "IANA zone; one per Space (ADR 0003)"
    boolean is_personal
    text created_by FK
  }

  space_member {
    uuid id PK
    uuid space_id FK
    text user_id FK
    space_role role "owner | editor | read-only"
  }

  invite {
    uuid id PK
    uuid space_id FK
    text email
    space_role role "default read-only; owner forbidden"
    text token UK
    text invited_by FK
    timestamptz expires_at "now + 7 days"
    timestamptz accepted_at "null while pending"
  }

  section {
    uuid id PK
    uuid space_id FK
    text name
    section_kind kind "daily | monthlies | tasks | notes | mixed"
    boolean is_system "true only for daily and monthlies"
    integer sort_order
  }

  task {
    uuid id PK
    uuid space_id FK
    uuid section_id FK
    section_kind section_kind "mirror of section.kind; daily|tasks|mixed"
    text title
    date due_on "calendar day in Space timezone"
    text assignee_id FK
    timestamptz completed_at "null while open; no midnight reset"
    text completed_by FK
    integer sort_order
    text created_by FK
  }

  monthly {
    uuid id PK
    uuid space_id FK
    uuid section_id FK
    section_kind section_kind "mirror of section.kind; monthlies only"
    text title
    integer due_day_of_month "1-31 as authored"
    date next_due_on "already clamped to a real day"
    text assignee_id FK
    timestamptz last_completed_at
    text last_completed_by FK
    integer sort_order
    text created_by FK
  }

  note {
    uuid id PK
    uuid space_id FK
    uuid section_id FK
    section_kind section_kind "mirror of section.kind; notes|mixed"
    text title
    text body "plain text in MVP"
    integer sort_order
    text created_by FK
  }

  notification_preference {
    uuid id PK
    text user_id FK
    uuid space_id FK
    integer days_before "default 3"
    boolean email_enabled "default true"
  }

  notification_log {
    uuid id PK
    uuid space_id FK
    notification_kind kind "monthly_due | daily_nudge"
    uuid entity_id "Task or Monthly; deliberately not an FK"
    text period "2026-09 for a Monthly, 2026-09-14 for a nudge"
    text recipient_user_id FK
    text recipient_email
    text idempotency_key UK
    timestamptz sent_at
  }
```

`task`, `monthly`, and `note` also point at `user` through `assignee_id`, `created_by`, and the completion columns. Those edges are left off the diagram above so the Section relationships stay readable; all of them are `ON DELETE SET NULL`, so removing a Member never deletes content.

## Enums

| Type | Values |
| --- | --- |
| `space_role` | `owner`, `editor`, `read-only` |
| `section_kind` | `daily`, `monthlies`, `tasks`, `notes`, `mixed` |
| `notification_kind` | `monthly_due`, `daily_nudge` |

## How Task vs Monthly is enforced

ADR 0001 says the two are separate domains forever. Rather than trust the services, the schema makes the illegal row unrepresentable.

`section` exposes a three-column unique key, and each content table stores a **mirror** of the Section's kind that is pinned to it by a composite foreign key and narrowed by a `CHECK`:

```mermaid
flowchart LR
  SC["section<br/><b>UNIQUE (id, space_id, kind)</b>"]

  TK["task<br/>CHECK section_kind IN<br/>daily · tasks · mixed"]
  MO["monthly<br/>CHECK section_kind =<br/>monthlies"]
  NO["note<br/>CHECK section_kind IN<br/>notes · mixed"]

  TK -- "FK (section_id, space_id, section_kind)" --> SC
  MO -- "FK (section_id, space_id, section_kind)" --> SC
  NO -- "FK (section_id, space_id, section_kind)" --> SC

  classDef anchor fill:#fdeee4,stroke:#c2410c,stroke-width:1.5px,color:#1c1917
  classDef child fill:#e6f2f0,stroke:#0f766e,stroke-width:1px,color:#1c1917
  class SC anchor
  class TK,MO,NO child
```

The pair closes both escape routes. Claiming `section_kind = 'monthlies'` on a Task trips the `CHECK`; claiming a legal kind while pointing `section_id` at the Monthlies Section trips the foreign key, because no `section` row matches that `(id, space_id, kind)` triple. Including `space_id` in the same key means a row can never reference a Section in another Space. `ON UPDATE CASCADE` keeps the mirrors honest if a Section's kind ever changes, and the child `CHECK` then rejects any change that would strand its rows.

`tests/db/domain-split.test.ts` exercises both the honest and the sneaky attempt for each table.

## Other invariants held by the database

| Constraint | Rule it protects |
| --- | --- |
| `space_member_single_owner_unique` | Partial unique index on `space_id where role = 'owner'` — one Owner per Space |
| `space_member_space_user_unique` | A user joins a Space once |
| `section_space_system_kind_unique` | Partial unique index on `(space_id, kind) where is_system` — exactly one Daily and one Monthlies |
| `section_system_kind_match` | `is_system` is true if and only if the kind is `daily` or `monthlies`; no custom Section can impersonate a system one |
| `invite_role_not_owner` | Ownership moves by transfer, never by Invite |
| `invite_space_email_pending_unique` | Partial unique index `where accepted_at is null` — one pending Invite per email per Space, re-invitable after acceptance |
| `notification_preference_user_space_unique` | Reminder preference is per user **per Space** |
| `notification_preference_days_before_range` | `days_before between 0 and 30` |
| `monthly_due_day_range` | `due_day_of_month between 1 and 31` |
| `notification_log_idempotency_key_unique` | An Inngest retry cannot double-send |

## Delete behaviour

| Deleting | Effect |
| --- | --- |
| `space` | Cascades to members, invites, sections, tasks, monthlies, notes, preferences, and its notification log |
| `section` | Cascades to its tasks, monthlies, and notes |
| `user` | Cascades to sessions, accounts, memberships, and preferences; **nulls** assignee / creator / completer columns and `space.created_by`, so content and history survive |

`notification_log.entity_id` is intentionally not a foreign key: the send record outlives the Task or Monthly it was about.

## Vocabulary to table

| CONTEXT term | Where it lives |
| --- | --- |
| Space, Personal Space | `space` (`is_personal`) |
| Active Space | Not stored in Phase B — a client/session concern |
| Member, Owner / Editor / Read-only | `space_member.role` |
| Invite | `invite` |
| Section, Daily, Monthlies | `section` (`kind`, `is_system`) |
| Task | `task` |
| Monthly | `monthly` |
| Note | `note` |
| Assignee | `task.assignee_id`, `monthly.assignee_id` |
| Upcoming | Not a table — a read-only view over `monthly.next_due_on` and `task.due_on` |
| Reminder | `notification_preference` + `notification_log` |
