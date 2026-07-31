// Storage layer. Uses Vercel KV if configured; otherwise falls back to
// a module-level object (fine for a single-instance free deploy / local dev).
let kv = null;
try {
  // Only loads if @vercel/kv env vars exist
  if (process.env.KV_REST_API_URL) {
    kv = require("@vercel/kv").kv;
  }
} catch (_) {}

const mem = new Map();

// A reading key looks like: reading:2026-07:home-first
const key = (period, slug) => `reading:${period}:${slug}`;

export async function saveReading(period, slug, data) {
  if (kv) return kv.set(key(period, slug), data);
  mem.set(key(period, slug), data);
}

export async function getReading(period, slug) {
  if (kv) return (await kv.get(key(period, slug))) || null;
  return mem.get(key(period, slug)) || null;
}

// Get every reading for a given period across all provided slugs
export async function getPeriodReadings(period, slugs) {
  const out = {};
  for (const slug of slugs) {
    out[slug] = await getReading(period, slug);
  }
  return out;
}
