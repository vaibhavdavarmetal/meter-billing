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

// ── Saved (approved) bills — the month history ────────────────
// A bill key looks like: bill:2026-07:home-first
const billKey = (period, slug) => `bill:${period}:${slug}`;

export async function saveBill(period, slug, data) {
  if (kv) return kv.set(billKey(period, slug), data);
  mem.set(billKey(period, slug), data);
}

export async function getBill(period, slug) {
  if (kv) return (await kv.get(billKey(period, slug))) || null;
  return mem.get(billKey(period, slug)) || null;
}

export async function getPeriodBills(period, slugs) {
  const out = {};
  for (const slug of slugs) {
    out[slug] = await getBill(period, slug);
  }
  return out;
}

// The most recent saved bill for a tenant BEFORE a given period —
// used to auto-fill the "previous" reading next month.
export async function getLatestBillBefore(period, slug) {
  // Walk back up to 24 months looking for the last saved bill.
  let [y, m] = period.split("-").map(Number);
  for (let i = 0; i < 24; i++) {
    m -= 1;
    if (m < 1) { m = 12; y -= 1; }
    const p = `${y}-${String(m).padStart(2, "0")}`;
    const b = await getBill(p, slug);
    if (b && b.currentReading != null) return b;
  }
  return null;
}

// ── Registry: the live tenant/property config editable in-app ──
// Stored under a single key. Seeded from config.js on first run.
const REGISTRY_KEY = "registry:v1";

export async function getRegistry() {
  if (kv) return (await kv.get(REGISTRY_KEY)) || null;
  return mem.get(REGISTRY_KEY) || null;
}

export async function saveRegistry(data) {
  if (kv) return kv.set(REGISTRY_KEY, data);
  mem.set(REGISTRY_KEY, data);
}

// ── Per-month extras: rent, misc charges, and payment status ──
// Keyed per tenant per period: extras:2026-07:home-first
const extrasKey = (period, slug) => `extras:${period}:${slug}`;

export async function getExtras(period, slug) {
  if (kv) return (await kv.get(extrasKey(period, slug))) || null;
  return mem.get(extrasKey(period, slug)) || null;
}

export async function saveExtras(period, slug, data) {
  if (kv) return kv.set(extrasKey(period, slug), data);
  mem.set(extrasKey(period, slug), data);
}

export async function getPeriodExtras(period, slugs) {
  const out = {};
  for (const slug of slugs) out[slug] = await getExtras(period, slug);
  return out;
}
