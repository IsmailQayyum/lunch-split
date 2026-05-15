// Pure-logic smoke tests. Run with: npx tsx scripts/smoke.ts
import { splitEvenly } from "../lib/shares";
import { newSlug } from "../lib/slug";
import { reminderEmailHtml } from "../lib/email";

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

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
