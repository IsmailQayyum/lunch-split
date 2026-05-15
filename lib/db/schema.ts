import {
  boolean,
  index,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

export const ticketStatusEnum = pgEnum("ticket_status", ["open", "closed"]);
export const participantStatusEnum = pgEnum("participant_status", [
  "pending",
  "self_marked",
  "confirmed",
  "cash",
]);

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  googleSub: text("google_sub").unique(),
  email: text("email").notNull().unique(),
  name: text("name"),
  image: text("image"),
  jazzcashNumber: text("jazzcash_number"),
  easypaisaNumber: text("easypaisa_number"),
  bankIban: text("bank_iban"),
  bankAccountTitle: text("bank_account_title"),
  acceptsCash: boolean("accepts_cash").notNull().default(true),
  slackUserId: text("slack_user_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const tickets = pgTable(
  "tickets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    slug: text("slug").notNull().unique(),
    payerId: uuid("payer_id")
      .notNull()
      .references(() => users.id),
    title: text("title").notNull(),
    totalAmount: numeric("total_amount", { precision: 12, scale: 2 }).notNull(),
    currency: text("currency").notNull().default("PKR"),
    receiptUrl: text("receipt_url"),
    notes: text("notes"),
    status: ticketStatusEnum("status").notNull().default("open"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
  },
  (t) => ({
    payerIdx: index("tickets_payer_idx").on(t.payerId),
    statusIdx: index("tickets_status_idx").on(t.status),
  }),
);

export const participants = pgTable(
  "participants",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ticketId: uuid("ticket_id")
      .notNull()
      .references(() => tickets.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id),
    pendingEmail: text("pending_email"),
    pendingSlackId: text("pending_slack_id"),
    guestName: text("guest_name").notNull(),
    amountOwed: numeric("amount_owed", { precision: 12, scale: 2 }).notNull(),
    status: participantStatusEnum("status").notNull().default("pending"),
    selfMarkedAt: timestamp("self_marked_at", { withTimezone: true }),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    proofUrl: text("proof_url"),
  },
  (t) => ({
    ticketIdx: index("participants_ticket_idx").on(t.ticketId),
    userIdx: index("participants_user_idx").on(t.userId),
    uniqUser: unique("participants_ticket_user_unique").on(t.ticketId, t.userId),
    uniqEmail: unique("participants_ticket_email_unique").on(t.ticketId, t.pendingEmail),
  }),
);

export const reminderLog = pgTable(
  "reminder_log",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    participantId: uuid("participant_id")
      .notNull()
      .references(() => participants.id, { onDelete: "cascade" }),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
    channel: text("channel").notNull().default("email"),
  },
  (t) => ({
    participantIdx: index("reminder_log_participant_idx").on(t.participantId),
  }),
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Ticket = typeof tickets.$inferSelect;
export type NewTicket = typeof tickets.$inferInsert;
export type Participant = typeof participants.$inferSelect;
export type NewParticipant = typeof participants.$inferInsert;
