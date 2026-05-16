import { head } from "@vercel/blob";
import { readFileSync } from "node:fs";

// Load .env.local manually (no dotenv dep needed)
const envText = readFileSync(".env.local", "utf-8");
for (const line of envText.split(/\r?\n/)) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (!m) continue;
  let v = m[2];
  if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
  process.env[m[1]] = v;
}

const slug = process.argv[2] ?? "KEtMrnwb";
const path = `tickets/${slug}.json`;

const meta = await head(path);
console.log("uploadedAt:", meta.uploadedAt.toISOString());
console.log("url:", meta.url);
console.log("size:", meta.size);

const res = await fetch(`${meta.url}?v=${meta.uploadedAt.getTime()}`, { cache: "no-store" });
const ticket = await res.json();

console.log("\n--- Ticket summary ---");
console.log("title:", ticket.title);
console.log("status:", ticket.status);
console.log("payer:", ticket.payer.name);
console.log("\n--- Participants ---");
for (const p of ticket.participants) {
  console.log(`  ${p.name.padEnd(20)} status=${p.status.padEnd(12)} selfMarkedAt=${p.selfMarkedAt ?? "-"} confirmedAt=${p.confirmedAt ?? "-"}`);
}
