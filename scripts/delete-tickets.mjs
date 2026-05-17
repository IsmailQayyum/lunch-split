// Batch-delete tickets by slug. Run with:
//   node scripts/delete-tickets.mjs                    # list current tickets
//   node scripts/delete-tickets.mjs slugA slugB slugC  # dry run for those slugs
//   node scripts/delete-tickets.mjs --write slugA slugB
//   node scripts/delete-tickets.mjs --all              # dry-list everything
//   node scripts/delete-tickets.mjs --all --write      # nuke EVERY ticket
//
// Requires .env.local with KV_REST_API_URL + KV_REST_API_TOKEN.

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

const args = process.argv.slice(2);
const write = args.includes("--write");
const all = args.includes("--all");
const slugArgs = args.filter((a) => !a.startsWith("--"));

const indexRaw = await redis.get("tickets:index");
const index = indexRaw ? JSON.parse(indexRaw) : [];

if (slugArgs.length === 0 && !all) {
  console.log("Current tickets:");
  for (const e of index) {
    console.log(
      `  ${e.slug.padEnd(10)} ${e.status === "closed" ? "[CLOSED]" : "[ OPEN ]"} ${e.title} — Rs ${e.totalAmount} (${e.payerName})`,
    );
  }
  console.log(
    `\nTotal: ${index.length}. To delete some, run with slugs as args. To nuke all, use --all --write.`,
  );
  process.exit(0);
}

const targets = all ? index.map((e) => e.slug) : slugArgs;

console.log(`Mode: ${write ? "WRITE" : "DRY RUN (use --write to apply)"}`);
console.log(`Targets (${targets.length}):`);
for (const slug of targets) {
  const entry = index.find((e) => e.slug === slug);
  console.log(
    `  ${slug.padEnd(10)} ${entry ? `→ ${entry.title} (Rs ${entry.totalAmount})` : "(not in index)"}`,
  );
}

if (!write) {
  console.log("\nDry run only. Re-run with --write to actually delete.");
  process.exit(0);
}

console.log("");
let deleted = 0;
for (const slug of targets) {
  await redis.del(`ticket:${slug}`);
  console.log(`  deleted ticket:${slug}`);
  deleted++;
}

// Rebuild index minus the deleted slugs (CAS-style, but since we're solo here
// we can just write directly).
const remaining = index.filter((e) => !targets.includes(e.slug));
await redis.set("tickets:index", JSON.stringify(remaining));
console.log(`  rebuilt tickets:index (${index.length} → ${remaining.length})`);

console.log(`\nDone. Deleted ${deleted} ticket(s).`);
