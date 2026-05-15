import {
  boolean,
  index,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const ticketStatusEnum = pgEnum("ticket_status", ["open", "closed"]);
export const participantStatusEnum = pgEnum("participant_status", [
  "pending",
  "self_marked",
  "confirmed",
  "cash",
]);

// Tickets carry the payer's contact + payment details inline.
// No user accounts. Trust model: anyone with the slug URL can view and act.
export const tickets = pgTable(
  "tickets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    slug: text("slug").notNull().unique(),

    title: text("title").notNull(),
    totalAmount: numeric("total_amount", { precision: 12, scale: 2 }).notNull(),
    currency: text("currency").notNull().default("PKR"),
    notes: text("notes"),

    payerName: text("payer_name").notNull(),
    payerEmail: text("payer_email"),
    payerWhatsapp: text("payer_whatsapp"),

    payerJazzcash: text("payer_jazzcash"),
    payerEasypaisa: text("payer_easypaisa"),
    payerIban: text("payer_iban"),
    payerAccountTitle: text("payer_account_title"),
    payerAcceptsCash: boolean("payer_accepts_cash").notNull().default(true),

    status: ticketStatusEnum("status").notNull().default("open"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
  },
  (t) => ({
    statusIdx: index("tickets_status_idx").on(t.status),
    createdIdx: index("tickets_created_idx").on(t.createdAt),
  }),
);

export const participants = pgTable(
  "participants",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ticketId: uuid("ticket_id")
      .notNull()
      .references(() => tickets.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    email: text("email"),
    whatsapp: text("whatsapp"),
    amountOwed: numeric("amount_owed", { precision: 12, scale: 2 }).notNull(),
    status: participantStatusEnum("status").notNull().default("pending"),
    selfMarkedAt: timestamp("self_marked_at", { withTimezone: true }),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  },
  (t) => ({
    ticketIdx: index("participants_ticket_idx").on(t.ticketId),
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
    channel: text("channel").notNull().default("whatsapp"),
  },
  (t) => ({
    participantIdx: index("reminder_log_participant_idx").on(t.participantId),
  }),
);

export type Ticket = typeof tickets.$inferSelect;
export type NewTicket = typeof tickets.$inferInsert;
export type Participant = typeof participants.$inferSelect;
export type NewParticipant = typeof participants.$inferInsert;
