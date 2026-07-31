// ── EDIT THIS FILE to match your properties and tenants ──────────
// Each tenant has a unique `slug` — that becomes their personal link:
//   https://YOUR-APP.vercel.app/?t=first-floor
// Share each tenant their own link once. They open it every month.

export const PROPERTIES = {
  home: {
    name: "Sector 57",
    mode: "rate",          // units × rate
    rate: 9,               // ₹ per unit
    tenants: [
      { slug: "home-first",    name: "First Floor" },
      { slug: "home-second",   name: "Second Floor" },
      { slug: "home-basement", name: "Basement" },
    ],
  },
  rental: {
    name: "Malibu",
    mode: "proportional",  // share of the actual total bill
    tenants: [
      { slug: "rent-1", name: "Tenant 1" },
      { slug: "rent-2", name: "Tenant 2" },
      { slug: "rent-3", name: "Tenant 3" },
      { slug: "rent-4", name: "Tenant 4" },
      { slug: "rent-5", name: "Tenant 5" },
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
      { slug: "test-tenant", name: "Test Tenant" },
    ],
  },
};

// A simple password to open the admin/billing page. CHANGE THIS.
export const ADMIN_PASSWORD = "vaibhavdavar";

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
