// ── EDIT THIS FILE to match your properties and tenants ──────────
// Each tenant has a unique `slug` — that becomes their personal link:
//   https://YOUR-APP.vercel.app/?t=first-floor
// Share each tenant their own link once. They open it every month.

// ── OWNER WHATSAPP NUMBER ──
// After a tenant submits a reading, they can tap "Notify owner on WhatsApp",
// which opens WhatsApp addressed to THIS number with a ready-to-send message.
// Enter your number with country code, digits only (e.g. India: 9198XXXXXXXX).
// You can also set it in Vercel as OWNER_WHATSAPP to avoid editing code.
export const OWNER_WHATSAPP = process.env.OWNER_WHATSAPP || "917760719777";

export const PROPERTIES = {
  home: {
    name: "Sector 57",
    mode: "rate",          // units × rate
    rate: 9,               // ₹ per unit
    tenants: [
      { slug: "home-first",    name: "First Floor",  rent: 0, misc: 0, startReading: 0, biMonthly: false, biMonthlyStart: "2026-08" },
      { slug: "home-second",   name: "Second Floor", rent: 0, misc: 0, startReading: 0 },
      { slug: "home-basement", name: "Basement",     rent: 0, misc: 0, startReading: 0 },
    ],
  },
  rental: {
    name: "Malibu",
    mode: "rate",          // fixed ₹/unit, editable on Manage
    rate: 9,
    tenants: [
      { slug: "rent-1", name: "Tenant 1", rent: 0, misc: 0, startReading: 0 },
      { slug: "rent-2", name: "Tenant 2", rent: 0, misc: 0, startReading: 0 },
      { slug: "rent-3", name: "Tenant 3", rent: 0, misc: 0, startReading: 0 },
      { slug: "rent-4", name: "Tenant 4", rent: 0, misc: 0, startReading: 0 },
      { slug: "rent-5", name: "Tenant 5", rent: 0, misc: 0, startReading: 0 },
    ],
  },
  // ── Practice area — safe to play with, never affects real bills ──
  // Use the link .../?t=test-tenant to try the whole flow.
  // Delete this whole `test:` block when you no longer need it.
  test: {
    name: "Practice (test only)",
    mode: "rate",
    rate: 9,
    isTest: true,          // admin shows this separately and never mixes it into real totals
    tenants: [
      { slug: "test-tenant", name: "Test Tenant", rent: 0, misc: 0 },
    ],
  },
};

// Returns a fresh deep copy of PROPERTIES to seed the editable registry.
export function seedRegistry() {
  return JSON.parse(JSON.stringify(PROPERTIES));
}

// A simple password to open the admin/billing page.
// Set ADMIN_PASSWORD in Vercel's Environment Variables — that value wins and
// survives every deploy. The default below is only a fallback if none is set.
export const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "change-me-123";

// Find a tenant + their property from a slug
export function findTenant(slug) {
  for (const [pkey, p] of Object.entries(PROPERTIES)) {
    const t = p.tenants.find((x) => x.slug === slug);
    if (t) return { tenant: t, property: p, propertyKey: pkey };
  }
  return null;
}

export function allTenants() {
  const out = [];
  for (const [pkey, p] of Object.entries(PROPERTIES)) {
    for (const t of p.tenants) out.push({ ...t, propertyKey: pkey, propertyName: p.name });
  }
  return out;
}
