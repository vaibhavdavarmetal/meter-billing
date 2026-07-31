// ── EDIT THIS FILE to match your properties and tenants ──────────
// Each tenant has a unique `slug` — that becomes their personal link:
//   https://YOUR-APP.vercel.app/?t=first-floor
// Share each tenant their own link once. They open it every month.

export const PROPERTIES = {
  home: {
    name: "Our Home",
    mode: "rate",          // units × rate
    rate: 9,               // ₹ per unit
    tenants: [
      { slug: "home-first",    name: "First Floor" },
      { slug: "home-second",   name: "Second Floor" },
      { slug: "basement", name: "Basement" },
    ],
  },
  rental: {
    name: "Rental House",
    mode: "proportional",  // share of the actual total bill
    tenants: [
      { slug: "malibu1", name: "Tenant 1" },
      { slug: "malibu2", name: "Tenant 2" },
      { slug: "malibu3", name: "Tenant 3" },
      { slug: "malibu4", name: "Tenant 4" },
      { slug: "malibu5", name: "Tenant 5" },
    ],
  },
};

// A simple password to open the admin/billing page. CHANGE THIS.
export const ADMIN_PASSWORD = "change-me-123";

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
