CREATE TYPE "public"."participant_status" AS ENUM('pending', 'self_marked', 'confirmed', 'cash');--> statement-breakpoint
CREATE TYPE "public"."ticket_status" AS ENUM('open', 'closed');--> statement-breakpoint
CREATE TABLE "participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ticket_id" uuid NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"whatsapp" text,
	"amount_owed" numeric(12, 2) NOT NULL,
	"status" "participant_status" DEFAULT 'pending' NOT NULL,
	"self_marked_at" timestamp with time zone,
	"confirmed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "reminder_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"participant_id" uuid NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"channel" text DEFAULT 'whatsapp' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tickets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"total_amount" numeric(12, 2) NOT NULL,
	"currency" text DEFAULT 'PKR' NOT NULL,
	"notes" text,
	"payer_name" text NOT NULL,
	"payer_email" text,
	"payer_whatsapp" text,
	"payer_jazzcash" text,
	"payer_easypaisa" text,
	"payer_iban" text,
	"payer_account_title" text,
	"payer_accepts_cash" boolean DEFAULT true NOT NULL,
	"status" "ticket_status" DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	CONSTRAINT "tickets_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "participants" ADD CONSTRAINT "participants_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminder_log" ADD CONSTRAINT "reminder_log_participant_id_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "participants_ticket_idx" ON "participants" USING btree ("ticket_id");--> statement-breakpoint
CREATE INDEX "reminder_log_participant_idx" ON "reminder_log" USING btree ("participant_id");--> statement-breakpoint
CREATE INDEX "tickets_status_idx" ON "tickets" USING btree ("status");--> statement-breakpoint
CREATE INDEX "tickets_created_idx" ON "tickets" USING btree ("created_at");