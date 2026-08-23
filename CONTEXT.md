# Orbit

A household-first coordination app for day-to-day to-dos and recurring monthly obligations, with optional personal Spaces.

## Product spine (MVP)

Household-first coordination: Daily Tasks vs Monthlies as separate domains, Space-level sharing/RBAC, Upcoming as a read-only view, email Reminders via Inngest + Resend. Dual API: `/api/v1` Route Handlers + web Server Actions over shared domain services. Full requirements: [`docs/spec.md`](./docs/spec.md).

## Language

### Containers and access

**Space**:
The container that owns members, sections, and permissions. The only share and permission boundary in MVP. Has a single timezone that defines due calendar days and Reminder timing for everyone in that Space. New Spaces default to the creator's timezone at creation; Owner can change it later. An owner may delete a Space; a user may not delete or leave their last remaining Space without another Space to keep.
_Avoid_: Household (as the container name), Workspace, Project, Account

**Personal Space**:
The default Space created for a user on first login, with system sections Daily and Monthlies already present. Private until others are invited. Users may also create additional Spaces (for example Home); the creator becomes Owner.
_Avoid_: Default workspace, home account

**Active Space**:
The Space the user is currently working in. Upcoming, Daily, Monthlies, and custom Sections are scoped to this Space; switching Spaces changes the whole main view. Quick-add targets the selected Section in this Space; Upcoming has no quick-add. Nav order is fixed as Upcoming, Daily, Monthlies, then custom Sections in user order - system Sections are not reorderable with customs.
_Avoid_: Current workspace, selected home

**Member**:
A user who belongs to a Space with a role of owner, editor, or read-only.
_Avoid_: Collaborator, participant, guest

**Invite**:
A pending offer to join a Space at a given role, addressed by email. Becomes a Member when accepted; not a Member beforehand. Default role when inviting is read-only; Owner can choose editor instead. Expires after 7 days if not accepted; Owner can resend.
_Avoid_: Pending member, guest, share link (MVP uses email invites, not link membership)

**Owner** / **Editor** / **Read-only**:
Space-level roles. All sections in a Space inherit the member's role. Read-only is view-only (no complete/reopen/create/edit/delete). Editor mutates content and custom Sections. Owner alone invites, changes roles, removes Members, and transfers ownership. A Space has a single Owner at a time.

**Viewer**:
The Member currently viewing the Active Space. Each request resolves exactly one Viewer for that Space, carrying the Member's role and its derived capabilities: mutate content (editor or owner) and manage members (owner). A read-only Viewer sees every view with mutations disabled.
_Avoid_: Session user, current user, visitor

**Ownership transfer**:
Owner action that makes another Member the Owner; the former Owner becomes an Editor (unless removed). Required before an Owner can leave a Space that still has other Members. An Owner-only Space must be deleted instead of left ownerless.


**Assignee**:
The Member a Task or Monthly is pointed at. Optional. Assignment is not the same as edit permission; a read-only Member may still be an Assignee.

### Content

**Section**:
A named partition of content inside a Space. Either a system section (Daily, Monthlies) or a user-created custom section with kind `tasks`, `notes`, or `mixed`.
_Avoid_: List, board, folder, tab (tab is a navigation chrome, not the domain object)


**Daily**:
The system section for day-to-day to-dos only. Always present in a Space; cannot be deleted or retyped. A different kind of commitment from Monthlies - not a filter on the same list.
_Avoid_: Today, Inbox

**Monthlies**:
The system section for recurring monthly obligations only. Always present in a Space; cannot be deleted or retyped. A different kind of commitment from Daily - not a filter on the same list.
_Avoid_: Recurring, Bills (unless a future bills feature is named)

**Task**:
A checklist item in Daily or in a custom tasks/mixed Section. Optional due date; not a monthly recurring obligation. Distinct from a Monthly. May move among Daily and custom task/mixed Sections; cannot be reclassified into Monthlies by moving - that requires delete and recreate as a Monthly. Completing a Daily Task keeps it completed until someone reopens or deletes it (no automatic midnight reset). Completed Daily Tasks are hidden by default, with an optional show-completed control.
_Avoid_: Todo (as the entity name), Item, Card, Chore


**Monthly**:
A recurring monthly obligation that lives only in the Monthlies section. Completing one finishes the current period and advances it to the next month's due date; it is not a one-shot Task. Cannot be moved into Daily or custom Sections - that requires delete and recreate as a Task. If the due day does not exist in a month, it clamps to that month's last day.
_Avoid_: Recurring task, monthly task (as the entity name), Bill

**Note**:
A freeform writing entity (title + plain-text body) that belongs to a notes or mixed Section. Not a Task: no completion, assignee, or reminder behavior in MVP. A mixed Section may contain many Notes and many Tasks.
_Avoid_: Document, page, memo, task-with-body, rich text / markdown (as MVP body format)


**Upcoming**:
A read-only aggregate view of Monthlies (by next due) and Tasks with due dates across Sections in the Space currently being viewed. Not a Section; users do not add items "into" Upcoming.
_Avoid_: Inbox, Agenda (as the entity name), Due view, Shared (not an MVP nav surface; use Space switcher and share bar)


### Notifications

**Reminder**:
An email about an upcoming Monthly (default: 3 days before due, user-configurable) or an incomplete Daily Task that is due today or overdue. Goes to the Assignee if set, otherwise the Space Owner. Preference (N days / email on-off) is per user per Space.
_Avoid_: Notification (as the email product term), Alert, Nudge (except as informal UI copy)
