import "server-only";
import { Redis } from "@upstash/redis";

// Single shared Upstash Redis client.
// `automaticDeserialization: false` so we control JSON encoding/decoding —
// the CAS scripts in store.ts/tickets-index.ts/store-roster.ts compare the
// stored value byte-for-byte against what we just read, and that only
// works if we always store strings (never auto-encoded objects).
export const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
  automaticDeserialization: false,
});

// CAS (compare-and-set) primitive used by every mutator: write only if the
// current stored value still matches what we read. If not, retry on the
// JS side with fresh data. Eliminates the read-modify-write clobbering
// that Vercel Blob couldn't prevent.
export const CAS_LUA = `
local current = redis.call('GET', KEYS[1])
if current ~= ARGV[1] then
  return current or ''
end
redis.call('SET', KEYS[1], ARGV[2])
return ARGV[2]
`;

// Same idea but for keys that may not yet exist (initial write — only if
// nothing is there yet).
export const SETNX_LUA = `
local current = redis.call('GET', KEYS[1])
if current ~= false then
  return current
end
redis.call('SET', KEYS[1], ARGV[1])
return ARGV[1]
`;

const BACKOFF_BASE_MS = 25;
const BACKOFF_JITTER_MS = 60;

export function casBackoff(): Promise<void> {
  return new Promise((r) =>
    setTimeout(r, BACKOFF_BASE_MS + Math.random() * BACKOFF_JITTER_MS),
  );
}

export const CAS_MAX_ATTEMPTS = 12;
