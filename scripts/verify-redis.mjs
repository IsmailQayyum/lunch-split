// Verify Redis state for a ticket. Run with:
//   node scripts/verify-redis.mjs [slug]

import { Redis } from "@upstash/redis";
import { readFileSync } from "node:fs";

const envText = readFileSync(".env.local", "utf-8");
for (const line of envText.split(/\r?\n/)) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (!m) continue;
  let v = m[2];
  if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
  process.env[m[1]] = v;
}

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
  automaticDeserialization: false,
});

const slug = process.argv[2] ?? "KEtMrnwb";
const raw = await redis.get(`ticket:${slug}`);
if (!raw) {
  console.log(`No ticket at ticket:${slug}`);
  process.exit(1);
}
const ticket = JSON.parse(raw);
console.log("title:", ticket.title);
console.log("status:", ticket.status);
console.log("payer:", ticket.payer.name);
console.log("\nParticipants:");
for (const p of ticket.participants) {
  console.log(
    `  ${p.name.padEnd(20)} status=${p.status.padEnd(12)} confirmedAt=${p.confirmedAt ?? "-"}`,
  );
}

const indexRaw = await redis.get("tickets:index");
const index = indexRaw ? JSON.parse(indexRaw) : [];
console.log(`\nIndex entries: ${index.length}`);

const rosterRaw = await redis.get("roster");
const roster = rosterRaw ? JSON.parse(rosterRaw) : [];
console.log(`Roster entries: ${roster.length}`);
