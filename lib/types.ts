export type ParticipantStatus = "pending" | "self_marked" | "confirmed" | "cash";
export type TicketStatus = "open" | "closed";

export type Participant = {
  id: string;
  name: string;
  email: string | null;
  whatsapp: string | null;
  amountOwed: number;
  status: ParticipantStatus;
  selfMarkedAt: string | null;
  confirmedAt: string | null;
};

export type Reminder = {
  participantId: string;
  sentAt: string;
  channel: "email" | "whatsapp";
};

export type PayerProfile = {
  name: string;
  email: string | null;
  whatsapp: string | null;
  jazzcash: string | null;
  easypaisa: string | null;
  iban: string | null;
  accountTitle: string | null;
  acceptsCash: boolean;
};

export type Ticket = {
  slug: string;
  title: string;
  totalAmount: number;
  currency: string;
  notes: string | null;
  payer: PayerProfile;
  participants: Participant[];
  reminders: Reminder[];
  status: TicketStatus;
  createdAt: string;
  closedAt: string | null;
};
