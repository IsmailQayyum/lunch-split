// One-shot: copy tickets, the tickets-index, and the roster from Vercel
// Blob over to Upstash Redis. Run with:
//
//   node scripts/migrate-blob-to-redis.mjs           # dry run, lists what would copy
//   node scripts/migrate-blob-to-redis.mjs --write   # actually write to Redis
//
// Requires .env.local with both BLOB_READ_WRITE_TOKEN (source) and KV_REST_API_*
// (destination). After it's run successfully, the Blob data can be left alone
// (orphaned) — nothing in the app reads from blob anymore.

import { list } from "@vercel/blob";
import { Redis } from "@upstash/redis";
import { readFileSync } from "node:fs";

// Load .env.local manually so we don't need a dotenv dep
const envText = readFileSync(".env.local", "utf-8");
for (const line of envText.split(/\r?\n/)) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (!m) continue;
  let v = m[2];
  if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
  process.env[m[1]] = v;
}

const writeMode = process.argv.includes("--write");
console.log(`Mode: ${writeMode ? "WRITE" : "DRY RUN (use --write to apply)"}`);

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
  automaticDeserialization: false,
});

async function fetchJsonByPath(prefix) {
  const { blobs } = await list({ prefix });
  const exact = blobs.find((b) => b.pathname === prefix);
  if (!exact) return null;
  const res = await fetch(`${exact.url}?t=${Date.now()}`, { cache: "no-store" });
  if (!res.ok) return null;
  return await res.json();
}

async function main() {
  console.log("\n--- Tickets ---");
  const { blobs: ticketBlobs } = await list({ prefix: "tickets/" });
  const ticketJsons = ticketBlobs.filter((b) => b.pathname.endsWith(".json"));
  console.log(`Found ${ticketJsons.length} ticket blobs`);

  let ticketsCopied = 0;
  for (const b of ticketJsons) {
    const res = await fetch(`${b.url}?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) {
      console.log(`  skip ${b.pathname}: fetch ${res.status}`);
      continue;
    }
    const ticket = await res.json();
    const slug = ticket.slug;
    if (!slug) {
      console.log(`  skip ${b.pathname}: no slug field`);
      continue;
    }
    const key = `ticket:${slug}`;
    console.log(
      `  ${writeMode ? "WRITE" : "would write"} ${key} (${ticket.title}, ${ticket.participants?.length ?? 0} participants, status=${ticket.status})`,
    );
    if (writeMode) {
      await redis.set(key, JSON.stringify(ticket));
    }
    ticketsCopied++;
  }
  console.log(`Tickets: ${ticketsCopied}/${ticketJsons.length} ${writeMode ? "copied" : "would copy"}`);

  console.log("\n--- Tickets index ---");
  const index = await fetchJsonByPath("tickets-index.json");
  if (Array.isArray(index)) {
    console.log(`Index has ${index.length} entries`);
    if (writeMode) {
      await redis.set("tickets:index", JSON.stringify(index));
      console.log("  WROTE tickets:index");
    } else {
      console.log("  would write tickets:index");
    }
  } else {
    console.log("No index blob found (or invalid). Will be rebuilt as tickets get written.");
  }

  console.log("\n--- Roster ---");
  const roster = await fetchJsonByPath("roster.json");
  if (Array.isArray(roster)) {
    console.log(`Roster has ${roster.length} entries`);
    if (writeMode) {
      await redis.set("roster", JSON.stringify(roster));
      console.log("  WROTE roster");
    } else {
      console.log("  would write roster");
    }
  } else {
    console.log("No roster blob found.");
  }

  console.log("\nDone.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
