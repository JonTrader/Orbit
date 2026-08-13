import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const createdAt = timestamp("created_at", { withTimezone: true })
  .notNull()
  .defaultNow();

const updatedAt = timestamp("updated_at", { withTimezone: true })
  .notNull()
  .defaultNow();

/* ---------------------------------------------------------------- Better Auth
 * Shape expected by the Better Auth Drizzle adapter (wired up in Phase C).
 * Column names are snake_case; the adapter resolves fields by the property
 * names on these table objects, not by database column name.
 * -------------------------------------------------------------------------- */

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt,
  updatedAt,
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    token: text("token").notNull().unique(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt,
    updatedAt,
  },
  (t) => [index("session_user_idx").on(t.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", {
      withTimezone: true,
    }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", {
      withTimezone: true,
    }),
    scope: text("scope"),
    password: text("password"),
    createdAt,
    updatedAt,
  },
  (t) => [index("account_user_idx").on(t.userId)],
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt,
    updatedAt,
  },
  (t) => [index("verification_identifier_idx").on(t.identifier)],
);

/* ------------------------------------------------------------------- Enums */

export const spaceRole = pgEnum("space_role", ["owner", "editor", "read-only"]);

export const sectionKind = pgEnum("section_kind", [
  "daily",
  "monthlies",
  "tasks",
  "notes",
  "mixed",
]);

export const notificationKind = pgEnum("notification_kind", [
  "monthly_due",
  "daily_nudge",
]);

/** Section kinds a Task may live in. Monthlies is deliberately absent (ADR 0001). */
export const TASK_SECTION_KINDS = ["daily", "tasks", "mixed"] as const;
/** The only section kind a Monthly may live in (ADR 0001). */
export const MONTHLY_SECTION_KINDS = ["monthlies"] as const;
/** Section kinds a Note may live in. */
export const NOTE_SECTION_KINDS = ["notes", "mixed"] as const;
/** Section kinds that are system sections and cannot be created by users. */
export const SYSTEM_SECTION_KINDS = ["daily", "monthlies"] as const;

const sqlList = (values: readonly string[]) =>
  sql.raw(values.map((v) => `'${v}'`).join(", "));

/* ------------------------------------------------------- Spaces and members */

export const space = pgTable("space", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  /** IANA zone that defines due calendar days and Reminder timing (ADR 0003). */
  timezone: text("timezone").notNull(),
  isPersonal: boolean("is_personal").notNull().default(false),
  createdBy: text("created_by").references(() => user.id, {
    onDelete: "set null",
  }),
  createdAt,
  updatedAt,
});

export const spaceMember = pgTable(
  "space_member",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    spaceId: uuid("space_id")
      .notNull()
      .references(() => space.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: spaceRole("role").notNull().default("read-only"),
    createdAt,
    updatedAt,
  },
  (t) => [
    unique("space_member_space_user_unique").on(t.spaceId, t.userId),
    uniqueIndex("space_member_single_owner_unique")
      .on(t.spaceId)
      .where(sql`${t.role} = 'owner'`),
    index("space_member_user_idx").on(t.userId),
  ],
);

/* ---------------------------------------------------------------- Sections */

export const section = pgTable(
  "section",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    spaceId: uuid("space_id")
      .notNull()
      .references(() => space.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    kind: sectionKind("kind").notNull(),
    isSystem: boolean("is_system").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt,
    updatedAt,
  },
  (t) => [
    // Target for the composite foreign keys that pin Task / Monthly / Note
    // rows to a section of a legal kind in the same Space.
    unique("section_id_space_kind_unique").on(t.id, t.spaceId, t.kind),
    check(
      "section_system_kind_match",
      sql`${t.isSystem} = (${t.kind} in (${sqlList(SYSTEM_SECTION_KINDS)}))`,
    ),
    // Exactly one Daily and one Monthlies per Space.
    uniqueIndex("section_space_system_kind_unique")
      .on(t.spaceId, t.kind)
      .where(sql`${t.isSystem}`),
    index("section_space_idx").on(t.spaceId),
  ],
);

/* -------------------------------------------------------------------- Task */

export const task = pgTable(
  "task",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    spaceId: uuid("space_id")
      .notNull()
      .references(() => space.id, { onDelete: "cascade" }),
    sectionId: uuid("section_id").notNull(),
    /** Mirrors section.kind so the composite FK + check can reject Monthlies. */
    sectionKind: sectionKind("section_kind").notNull(),
    title: text("title").notNull(),
    /** Calendar day in the Space timezone (ADR 0003). */
    dueOn: date("due_on"),
    assigneeId: text("assignee_id").references(() => user.id, {
      onDelete: "set null",
    }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    completedBy: text("completed_by").references(() => user.id, {
      onDelete: "set null",
    }),
    sortOrder: integer("sort_order").notNull().default(0),
    createdBy: text("created_by").references(() => user.id, {
      onDelete: "set null",
    }),
    createdAt,
    updatedAt,
  },
  (t) => [
    foreignKey({
      name: "task_section_kind_fk",
      columns: [t.sectionId, t.spaceId, t.sectionKind],
      foreignColumns: [section.id, section.spaceId, section.kind],
    })
      .onDelete("cascade")
      .onUpdate("cascade"),
    check(
      "task_section_kind_allowed",
      sql`${t.sectionKind} in (${sqlList(TASK_SECTION_KINDS)})`,
    ),
    index("task_section_idx").on(t.sectionId),
    index("task_space_due_idx").on(t.spaceId, t.dueOn),
  ],
);

/* ----------------------------------------------------------------- Monthly */

export const monthly = pgTable(
  "monthly",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    spaceId: uuid("space_id")
      .notNull()
      .references(() => space.id, { onDelete: "cascade" }),
    sectionId: uuid("section_id").notNull(),
    /** Mirrors section.kind so the composite FK + check pin this to Monthlies. */
    sectionKind: sectionKind("section_kind").notNull(),
    title: text("title").notNull(),
    /** 1–31 as authored. Short months clamp when nextDueOn is computed. */
    dueDayOfMonth: integer("due_day_of_month").notNull(),
    /** Next due calendar day in the Space timezone, already clamped. */
    nextDueOn: date("next_due_on").notNull(),
    assigneeId: text("assignee_id").references(() => user.id, {
      onDelete: "set null",
    }),
    lastCompletedAt: timestamp("last_completed_at", { withTimezone: true }),
    lastCompletedBy: text("last_completed_by").references(() => user.id, {
      onDelete: "set null",
    }),
    sortOrder: integer("sort_order").notNull().default(0),
    createdBy: text("created_by").references(() => user.id, {
      onDelete: "set null",
    }),
    createdAt,
    updatedAt,
  },
  (t) => [
    foreignKey({
      name: "monthly_section_kind_fk",
      columns: [t.sectionId, t.spaceId, t.sectionKind],
      foreignColumns: [section.id, section.spaceId, section.kind],
    })
      .onDelete("cascade")
      .onUpdate("cascade"),
    check(
      "monthly_section_kind_allowed",
      sql`${t.sectionKind} in (${sqlList(MONTHLY_SECTION_KINDS)})`,
    ),
    check(
      "monthly_due_day_range",
      sql`${t.dueDayOfMonth} between 1 and 31`,
    ),
    index("monthly_section_idx").on(t.sectionId),
    index("monthly_space_next_due_idx").on(t.spaceId, t.nextDueOn),
  ],
);

/* -------------------------------------------------------------------- Note */

export const note = pgTable(
  "note",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    spaceId: uuid("space_id")
      .notNull()
      .references(() => space.id, { onDelete: "cascade" }),
    sectionId: uuid("section_id").notNull(),
    sectionKind: sectionKind("section_kind").notNull(),
    title: text("title").notNull(),
    /** Plain text only in MVP (spec §5). */
    body: text("body").notNull().default(""),
    sortOrder: integer("sort_order").notNull().default(0),
    createdBy: text("created_by").references(() => user.id, {
      onDelete: "set null",
    }),
    createdAt,
    updatedAt,
  },
  (t) => [
    foreignKey({
      name: "note_section_kind_fk",
      columns: [t.sectionId, t.spaceId, t.sectionKind],
      foreignColumns: [section.id, section.spaceId, section.kind],
    })
      .onDelete("cascade")
      .onUpdate("cascade"),
    check(
      "note_section_kind_allowed",
      sql`${t.sectionKind} in (${sqlList(NOTE_SECTION_KINDS)})`,
    ),
    index("note_section_idx").on(t.sectionId),
  ],
);

/* ------------------------------------------------------------------ Invite */

export const invite = pgTable(
  "invite",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    spaceId: uuid("space_id")
      .notNull()
      .references(() => space.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: spaceRole("role").notNull().default("read-only"),
    token: text("token").notNull().unique(),
    invitedBy: text("invited_by").references(() => user.id, {
      onDelete: "set null",
    }),
    /** Owner-resendable; refreshed to now + 7 days on resend (spec §4). */
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    createdAt,
    updatedAt,
  },
  (t) => [
    // Ownership moves by transfer, never by invite.
    check("invite_role_not_owner", sql`${t.role} <> 'owner'`),
    uniqueIndex("invite_space_email_pending_unique")
      .on(t.spaceId, t.email)
      .where(sql`${t.acceptedAt} is null`),
    index("invite_space_idx").on(t.spaceId),
  ],
);

/* ----------------------------------------------------------- Notifications */

export const notificationPreference = pgTable(
  "notification_preference",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    spaceId: uuid("space_id")
      .notNull()
      .references(() => space.id, { onDelete: "cascade" }),
    /** Days before a Monthly is due to send its Reminder (spec §6). */
    daysBefore: integer("days_before").notNull().default(3),
    emailEnabled: boolean("email_enabled").notNull().default(true),
    createdAt,
    updatedAt,
  },
  (t) => [
    unique("notification_preference_user_space_unique").on(t.userId, t.spaceId),
    check("notification_preference_days_before_range", sql`${t.daysBefore} between 0 and 30`),
  ],
);

export const notificationLog = pgTable(
  "notification_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    spaceId: uuid("space_id")
      .notNull()
      .references(() => space.id, { onDelete: "cascade" }),
    kind: notificationKind("kind").notNull(),
    /** Task or Monthly id; not an FK so the log survives deletion. */
    entityId: uuid("entity_id").notNull(),
    /** Period the send covers, e.g. "2026-08" for a Monthly, "2026-08-13" daily. */
    period: text("period").notNull(),
    recipientUserId: text("recipient_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    recipientEmail: text("recipient_email").notNull(),
    /** Idempotency guard so an Inngest retry cannot double-send (spec §6). */
    idempotencyKey: text("idempotency_key").notNull().unique(),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt,
  },
  (t) => [index("notification_log_space_idx").on(t.spaceId)],
);

export type SpaceRole = (typeof spaceRole.enumValues)[number];
export type SectionKind = (typeof sectionKind.enumValues)[number];
export type NotificationKind = (typeof notificationKind.enumValues)[number];
