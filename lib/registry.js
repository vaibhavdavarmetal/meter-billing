import { getRegistry, saveRegistry } from "./store";
import { seedRegistry } from "./config";

// Returns the live properties object: from storage if it exists,
// otherwise seeds storage from config.js and returns that.
export async function liveProperties() {
  let reg = await getRegistry();
  if (!reg) {
    reg = seedRegistry();
    await saveRegistry(reg);
  }
  return reg;
}

export function allTenantsFrom(properties) {
  const out = [];
  for (const [pkey, p] of Object.entries(properties)) {
    for (const t of p.tenants) out.push({ ...t, propertyKey: pkey, propertyName: p.name });
  }
  return out;
}

export function findTenantIn(properties, slug) {
  for (const [pkey, p] of Object.entries(properties)) {
    const t = p.tenants.find((x) => x.slug === slug);
    if (t) return { tenant: t, property: p, propertyKey: pkey };
  }
  return null;
}

// Basic validation for a registry payload coming from the admin page.
export function validateRegistry(reg) {
  if (!reg || typeof reg !== "object") return "Invalid data";
  const seenSlugs = new Set();
  for (const [pkey, p] of Object.entries(reg)) {
    if (!p.name || typeof p.name !== "string") return `Property ${pkey} needs a name`;
    if (!Array.isArray(p.tenants)) return `Property ${pkey} needs tenants`;
    for (const t of p.tenants) {
      if (!t.slug || !/^[a-z0-9-]+$/.test(t.slug)) return `Bad slug: ${t.slug || "(empty)"}`;
      if (seenSlugs.has(t.slug)) return `Duplicate link id: ${t.slug}`;
      seenSlugs.add(t.slug);
    }
  }
  return null; // valid
}
