// Pure-logic smoke tests. Run with: npx tsx scripts/smoke.ts
import { splitEvenly } from "../lib/shares";
import { newSlug } from "../lib/slug";
import { reminderEmailHtml } from "../lib/email";
import { computeBalances } from "../lib/balances";
import type { IndexEntry, IndexParticipant } from "../lib/tickets-index";

let passed = 0;
let failed = 0;
function assert(cond: unknown, msg: string) {
  if (cond) {
    console.log(`  ✓ ${msg}`);
    passed++;
  } else {
    console.log(`  ✗ ${msg}`);
    failed++;
  }
}

console.log("\nsplitEvenly:");
{
  const s = splitEvenly(100, 4);
  assert(s.length === 4, "returns 4 entries for n=4");
  assert(s.reduce((a, b) => a + b, 0) === 100, "shares sum to total exactly (100)");
}
{
  const s = splitEvenly(101, 4);
  assert(s.reduce((a, b) => a + b, 0) === 101, "remainder distributed for odd total (101)");
  assert(s[0] === 26 && s[3] === 25, "extra rupees go to first shares");
}
{
  const s = splitEvenly(3500, 7);
  assert(s.every((x) => x === 500), "even total divides cleanly");
}
{
  assert(splitEvenly(0, 0).length === 0, "n=0 returns empty");
  assert(splitEvenly(100, 1)[0] === 100, "n=1 takes the whole total");
}

console.log("\nnewSlug:");
{
  const a = newSlug();
  const b = newSlug();
  assert(a.length === 8, "8 chars");
  assert(a !== b, "two slugs differ");
  assert(/^[a-zA-Z0-9]+$/.test(a), "url-safe charset");
}

console.log("\nreminderEmailHtml:");
{
  const html = reminderEmailHtml({
    to: "x@y",
    payerName: "Ismail",
    ticketTitle: "KFC <Friday>",
    amount: "350",
    ticketUrl: "https://app/t/abc",
  });
  assert(html.includes("Ismail"), "payer name interpolated");
  assert(html.includes("KFC &lt;Friday&gt;"), "title HTML-escaped (no raw <Friday>)");
  assert(!html.includes("<Friday>"), "no raw unescaped angle brackets from input");
  assert(html.includes("https://app/t/abc"), "ticket URL present");
  assert(html.includes("Rs. 350") || html.includes("350"), "amount visible");
}

console.log("\ncomputeBalances:");
{
  const entry = (
    slug: string,
    payer: { name: string; email: string | null },
    participants: IndexParticipant[],
    opts: Partial<IndexEntry> = {},
  ): IndexEntry => ({
    slug,
    title: `Ticket ${slug}`,
    totalAmount: participants.reduce((a, p) => a + p.amountOwed, 0),
    currency: "PKR",
    payerName: payer.name,
    payerEmail: payer.email,
    status: "open",
    createdAt: "2026-08-01T00:00:00.000Z",
    closedAt: null,
    participantCount: participants.length,
    settledCount: 0,
    participants,
    groupId: null,
    ...opts,
  });
  const me = "me@x.com";

  const entries: IndexEntry[] = [
    // I paid; Ali owes 1000 pending, Bilal settled, my own share auto-confirmed
    entry("t1", { name: "Me", email: me }, [
      { name: "Me", email: me, status: "confirmed", amountOwed: 500 },
      { name: "Ali", email: "ali@x.com", status: "pending", amountOwed: 1000 },
      { name: "Bilal", email: "bilal@x.com", status: "cash", amountOwed: 700 },
    ]),
    // I paid; Ali self_marked 2000, plus a guest with no email
    entry(
      "t2",
      { name: "Me", email: me },
      [
        { name: "Ali", email: "ALI@X.COM", status: "self_marked", amountOwed: 2000 },
        { name: "Guest Guy", email: null, status: "pending", amountOwed: 300 },
      ],
      { createdAt: "2026-08-10T00:00:00.000Z" },
    ),
    // Ali paid; I owe 450
    entry("t3", { name: "Ali", email: "ali@x.com" }, [
      { name: "Me", email: me, status: "pending", amountOwed: 450 },
    ]),
    // Closed ticket must be excluded entirely
    entry(
      "t4",
      { name: "Me", email: me },
      [{ name: "Ali", email: "ali@x.com", status: "pending", amountOwed: 9999 }],
      { status: "closed" },
    ),
    // My own pending share on my own ticket is not a debt
    entry("t5", { name: "Me", email: me }, [
      { name: "Me", email: me, status: "pending", amountOwed: 123 },
    ]),
  ];

  const balances = computeBalances(entries, "ME@X.com");
  const ali = balances.find((b) => b.key === "ali@x.com");
  const guest = balances.find((b) => b.key === "name:guest guy");

  assert(!!ali, "counterparty grouped by lowercased email across tickets");
  assert(ali!.owesYou.total === 3000, "owesYou total sums pending + self_marked (3000)");
  assert(ali!.owesYou.lines.length === 2, "owesYou has one line per ticket share");
  assert(ali!.youOwe.total === 450, "youOwe direction populated for same person");
  assert(
    ali!.owesYou.lines[0].slug === "t2" && ali!.owesYou.lines[0].status === "self_marked",
    "lines sorted newest-first and keep status",
  );
  assert(!!guest && guest!.email === null, "null-email guest grouped under name: key");
  assert(guest!.owesYou.total === 300, "guest amount counted");
  assert(
    balances.every((b) => !b.owesYou.lines.some((l) => l.slug === "t4")),
    "closed tickets excluded",
  );
  assert(
    !balances.some((b) => b.key === "me@x.com"),
    "viewer's own share on own ticket excluded",
  );
  assert(balances[0].key === "ali@x.com", "sorted by owesYou total desc");
  for (const b of balances) {
    const sum = (ls: { amount: number }[]) => ls.reduce((a, l) => a + l.amount, 0);
    assert(
      b.owesYou.total === sum(b.owesYou.lines) && b.youOwe.total === sum(b.youOwe.lines),
      `totals equal sum of lines (${b.key})`,
    );
  }
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
