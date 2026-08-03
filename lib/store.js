// Storage layer. Uses a Redis store (Vercel's current KV offering) when
// REDIS_URL / KV_URL is present; otherwise falls back to in-memory (dev only).
//
// IMPORTANT: in-memory does NOT persist — data vanishes when the server
// instance recycles. A connected Redis store is what makes saves permanent.

import { createClient } from "redis";

const REDIS_URL = process.env.REDIS_URL || process.env.KV_URL || null;

let clientPromise = null;
async function getClient() {
  if (!REDIS_URL) return null;
  if (!clientPromise) {
    const client = createClient({ url: REDIS_URL });
    client.on("error", () => {}); // avoid crashing on transient errors
    clientPromise = client.connect().then(() => client).catch(() => null);
  }
  return clientPromise;
}

const mem = new Map();

// All values are JSON-encoded strings in Redis, decoded on read.
async function kvSet(k, value) {
  const client = await getClient();
  if (client) { await client.set(k, JSON.stringify(value)); return; }
  mem.set(k, value);
}
async function kvGet(k) {
  const client = await getClient();
  if (client) {
    const raw = await client.get(k);
    if (raw == null) return null;
    try { return JSON.parse(raw); } catch { return null; }
  }
  return mem.get(k) || null;
}

// Batched read: fetch many keys in one round-trip (Redis MGET), decode each.
async function kvGetMany(keys) {
  if (keys.length === 0) return [];
  const client = await getClient();
  if (client) {
    const raws = await client.mGet(keys);
    return raws.map((raw) => {
      if (raw == null) return null;
      try { return JSON.parse(raw); } catch { return null; }
    });
  }
  return keys.map((k) => mem.get(k) || null);
}

// ── Readings ──
const key = (period, slug) => `reading:${period}:${slug}`;
export async function saveReading(period, slug, data) { return kvSet(key(period, slug), data); }
export async function getReading(period, slug) { return kvGet(key(period, slug)); }
export async function getPeriodReadings(period, slugs) {
  const vals = await kvGetMany(slugs.map((s) => key(period, s)));
  const out = {};
  slugs.forEach((s, i) => { out[s] = vals[i]; });
  return out;
}

// ── Saved bills (month history) ──
const billKey = (period, slug) => `bill:${period}:${slug}`;
export async function saveBill(period, slug, data) { return kvSet(billKey(period, slug), data); }
export async function getBill(period, slug) { return kvGet(billKey(period, slug)); }
export async function getPeriodBills(period, slugs) {
  const vals = await kvGetMany(slugs.map((s) => billKey(period, s)));
  const out = {};
  slugs.forEach((s, i) => { out[s] = vals[i]; });
  return out;
}
export async function getLatestBillBefore(period, slug) {
  // Build keys for the previous 12 months, fetch in one batched call,
  // then pick the most recent non-empty one.
  let [y, m] = period.split("-").map(Number);
  const keys = [];
  for (let i = 0; i < 12; i++) {
    m -= 1;
    if (m < 1) { m = 12; y -= 1; }
    keys.push(billKey(`${y}-${String(m).padStart(2, "0")}`, slug));
  }
  const vals = await kvGetMany(keys);
  for (const b of vals) {
    if (b && b.currentReading != null) return b;
  }
  return null;
}

// ── Registry (editable tenant/property config) ──
const REGISTRY_KEY = "registry:v1";
export async function getRegistry() { return kvGet(REGISTRY_KEY); }
export async function saveRegistry(data) { return kvSet(REGISTRY_KEY, data); }

// ── Per-month extras: rent, misc, payment status ──
const extrasKey = (period, slug) => `extras:${period}:${slug}`;
export async function getExtras(period, slug) { return kvGet(extrasKey(period, slug)); }
export async function saveExtras(period, slug, data) { return kvSet(extrasKey(period, slug), data); }
export async function getPeriodExtras(period, slugs) {
  const vals = await kvGetMany(slugs.map((s) => extrasKey(period, s)));
  const out = {};
  slugs.forEach((s, i) => { out[s] = vals[i]; });
  return out;
}

// ── Approval state per tenant per month ──
const approvalKey = (period, slug) => `approval:${period}:${slug}`;
export async function getApproval(period, slug) { return kvGet(approvalKey(period, slug)); }
export async function saveApproval(period, slug, data) { return kvSet(approvalKey(period, slug), data); }
export async function getPeriodApprovals(period, slugs) {
  const vals = await kvGetMany(slugs.map((s) => approvalKey(period, s)));
  const out = {};
  slugs.forEach((s, i) => { out[s] = vals[i]; });
  return out;
}

// ── House help (staff) ──
const STAFF_KEY = "staff:v1";
export async function getStaff() { return kvGet(STAFF_KEY); }
export async function saveStaff(list) { return kvSet(STAFF_KEY, list); }

const staffEntryKey = (period, id) => `staffentry:${period}:${id}`;
export async function getStaffEntry(period, id) { return kvGet(staffEntryKey(period, id)); }
export async function saveStaffEntry(period, id, data) { return kvSet(staffEntryKey(period, id), data); }
export async function getPeriodStaffEntries(period, ids) {
  const vals = await kvGetMany(ids.map((id) => staffEntryKey(period, id)));
  const out = {};
  ids.forEach((id, i) => { out[id] = vals[i]; });
  return out;
}
export async function getLatestStaffEntryBefore(period, id) {
  let [y, m] = period.split("-").map(Number);
  const keys = [];
  for (let i = 0; i < 12; i++) {
    m -= 1;
    if (m < 1) { m = 12; y -= 1; }
    keys.push(staffEntryKey(`${y}-${String(m).padStart(2, "0")}`, id));
  }
  const vals = await kvGetMany(keys);
  for (const e of vals) { if (e) return e; }
  return null;
}
