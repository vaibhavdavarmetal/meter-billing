import { ADMIN_PASSWORD } from "../../../lib/config";
import { liveProperties } from "../../../lib/registry";
import { getAccounts, saveAccounts } from "../../../lib/store";

export const runtime = "nodejs";

// The accounts locker holds reference details for utility / service accounts,
// grouped by a user-defined group (a property, or a personal group like "Family").
// Owner-only; never stores passwords or PINs.

// Seed groups from the property names + a "Personal" group the first time.
async function defaults() {
  const props = await liveProperties();
  const groups = Object.values(props || {})
    .filter((p) => !p.isTest)
    .map((p) => p.name);
  if (!groups.includes("Personal")) groups.push("Personal");
  return { groups, items: [] };
}

// GET /api/accounts?pw=...  → { accounts: { groups, items } }
export async function GET(req) {
  const { searchParams } = new URL(req.url);
  if (searchParams.get("pw") !== ADMIN_PASSWORD) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const stored = await getAccounts();
  const accounts = stored && Array.isArray(stored.items) ? stored : await defaults();
  return Response.json({ accounts });
}

// POST /api/accounts  { pw, accounts:{groups,items} }  → save
export async function POST(req) {
  try {
    const body = await req.json();
    if (body.pw !== ADMIN_PASSWORD) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const a = body.accounts;
    if (!a || !Array.isArray(a.groups) || !Array.isArray(a.items)) {
      return Response.json({ error: "Invalid accounts data" }, { status: 400 });
    }
    // Normalise: keep only known shapes, strip anything unexpected.
    const groups = a.groups.map((g) => String(g || "").trim()).filter(Boolean).slice(0, 40);
    const items = a.items.slice(0, 500).map((it) => ({
      id: String(it.id || ""),
      group: String(it.group || ""),
      name: String(it.name || ""),
      type: String(it.type || ""),
      accountNo: String(it.accountNo || ""),
      fields: Array.isArray(it.fields)
        ? it.fields.slice(0, 20).map((f) => ({ label: String(f.label || ""), value: String(f.value || "") }))
        : [],
      loginUrl: String(it.loginUrl || ""),
      username: String(it.username || ""),
      notes: String(it.notes || ""),
    }));
    await saveAccounts({ groups, items });
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: "Could not save" }, { status: 500 });
  }
}
