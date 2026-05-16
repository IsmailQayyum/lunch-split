import { ImageResponse } from "next/og";
import { getTicket } from "@/lib/store";

export const runtime = "nodejs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Slack/Twitter/iMessage/etc. fetch this when someone pastes the ticket URL,
// so the link unfurls into a printed-receipt preview card.
export default async function OGImage({ params }: { params: { slug: string } }) {
  const ticket = await getTicket(params.slug);

  if (!ticket) {
    return new ImageResponse(
      (
        <div
          style={{
            display: "flex",
            width: "100%",
            height: "100%",
            alignItems: "center",
            justifyContent: "center",
            background: "#f0e7cf",
            color: "#15110b",
            fontSize: 56,
            fontFamily: "serif",
            fontStyle: "italic",
          }}
        >
          Ticket not found.
        </div>
      ),
      size,
    );
  }

  const paid = ticket.participants.filter(
    (p) => p.status === "confirmed" || p.status === "cash",
  );
  const pending = ticket.participants.filter(
    (p) => p.status !== "confirmed" && p.status !== "cash",
  );
  const pendingTotal = pending.reduce((s, p) => s + p.amountOwed, 0);
  const paidTotal = paid.reduce((s, p) => s + p.amountOwed, 0);

  const billDate = new Date(ticket.createdAt).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  const PAPER = "#f0e7cf";
  const PAPER_LIGHT = "#f8efd8";
  const INK = "#15110b";
  const INK_SOFT = "#2e251a";
  const INK_FAINT = "#6e5c43";
  const SAFFRON = "#b8401f";
  const MOSS = "#3e6131";

  const visible = ticket.participants.slice(0, 6);
  const overflow = ticket.participants.length - visible.length;

  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          width: "100%",
          height: "100%",
          background: PAPER,
          color: INK,
          padding: "56px 72px",
          fontFamily: "serif",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", width: "100%" }}>
          {/* Header strip */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
              fontFamily: "monospace",
              fontSize: 20,
              letterSpacing: 3,
              color: INK_FAINT,
              textTransform: "uppercase",
            }}
          >
            <span>🍱 LUNCH SPLIT · RECEIPT</span>
            <span
              style={{
                color: ticket.status === "closed" ? MOSS : SAFFRON,
                fontWeight: 700,
              }}
            >
              {ticket.status === "closed" ? "✓ CLOSED" : "● LIVE"}
            </span>
          </div>

          {/* Title */}
          <div
            style={{
              display: "flex",
              fontStyle: "italic",
              fontSize: 88,
              lineHeight: 1,
              marginTop: 18,
              letterSpacing: -1,
            }}
          >
            {ticket.title}
          </div>

          {/* Meta */}
          <div
            style={{
              display: "flex",
              gap: 18,
              alignItems: "baseline",
              marginTop: 18,
              fontSize: 22,
              color: INK_SOFT,
            }}
          >
            <span style={{ fontFamily: "monospace", letterSpacing: 2 }}>
              PAID BY
            </span>
            <span style={{ fontStyle: "italic", fontSize: 30 }}>
              {ticket.payer.name}
            </span>
            <span style={{ color: INK_FAINT }}>·</span>
            <span style={{ fontFamily: "monospace", letterSpacing: 1, fontSize: 18 }}>
              {billDate.toUpperCase()}
            </span>
          </div>

          {/* Double rule */}
          <div
            style={{
              display: "flex",
              borderTop: `2px solid ${INK}`,
              borderBottom: `2px solid ${INK}`,
              height: 6,
              marginTop: 26,
              marginBottom: 22,
            }}
          />

          {/* Itemized */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10, flex: 1 }}>
            {visible.map((p) => {
              const isPaid = p.status === "confirmed" || p.status === "cash";
              return (
                <div
                  key={p.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "baseline",
                    fontSize: 26,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "baseline", gap: 14 }}>
                    <span style={{ fontStyle: "italic" }}>{p.name}</span>
                    <span
                      style={{
                        fontFamily: "monospace",
                        fontSize: 13,
                        letterSpacing: 2,
                        padding: "2px 8px",
                        border: `1.5px solid ${isPaid ? MOSS : SAFFRON}`,
                        color: isPaid ? MOSS : SAFFRON,
                        fontWeight: 700,
                      }}
                    >
                      {isPaid ? "PAID" : "PENDING"}
                    </span>
                  </div>
                  <span style={{ fontFamily: "monospace", fontSize: 28 }}>
                    ₨ {p.amountOwed.toLocaleString("en-PK")}
                  </span>
                </div>
              );
            })}
            {overflow > 0 && (
              <div
                style={{
                  display: "flex",
                  fontSize: 18,
                  color: INK_FAINT,
                  fontStyle: "italic",
                  marginTop: 4,
                }}
              >
                + {overflow} more on the receipt
              </div>
            )}
          </div>

          {/* Totals row */}
          <div
            style={{
              display: "flex",
              borderTop: `1px dashed ${INK_FAINT}`,
              paddingTop: 18,
              marginTop: 18,
              alignItems: "baseline",
              justifyContent: "space-between",
            }}
          >
            <div style={{ display: "flex", gap: 30 }}>
              <div style={{ display: "flex", flexDirection: "column" }}>
                <span style={{ fontFamily: "monospace", fontSize: 14, letterSpacing: 2, color: MOSS }}>
                  RECEIVED
                </span>
                <span style={{ fontFamily: "monospace", fontSize: 26, color: MOSS }}>
                  ₨ {paidTotal.toLocaleString("en-PK")}
                </span>
              </div>
              <div style={{ display: "flex", flexDirection: "column" }}>
                <span style={{ fontFamily: "monospace", fontSize: 14, letterSpacing: 2, color: SAFFRON }}>
                  PENDING
                </span>
                <span style={{ fontFamily: "monospace", fontSize: 26, color: SAFFRON }}>
                  ₨ {pendingTotal.toLocaleString("en-PK")}
                </span>
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
              <span style={{ fontFamily: "monospace", fontSize: 14, letterSpacing: 3, color: INK_FAINT }}>
                TOTAL
              </span>
              <span style={{ fontFamily: "monospace", fontSize: 54, fontWeight: 700 }}>
                ₨ {ticket.totalAmount.toLocaleString("en-PK")}
              </span>
            </div>
          </div>

          {/* Footer strip */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginTop: 18,
              fontFamily: "monospace",
              fontSize: 14,
              letterSpacing: 3,
              color: INK_FAINT,
              textTransform: "uppercase",
            }}
          >
            <span>SETTLED {paid.length}/{ticket.participants.length}</span>
            <span style={{ color: INK_SOFT }}>TRX · {ticket.slug.toUpperCase()}</span>
          </div>
        </div>
      </div>
    ),
    size,
  );
}
