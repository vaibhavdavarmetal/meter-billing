import { liveProperties, findTenantIn, allTenantsFrom } from "../../../lib/registry";
import { getSettlement, getLatestBillBefore, getReading } from "../../../lib/store";
import { ADMIN_PASSWORD } from "../../../lib/config";

export const runtime = "nodejs";

function currentPeriod() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// GET /api/settlement?pending=1&pw=... → list of pending move-in baselines to verify
// GET /api/settlement?t=slug&pw=...    → tenant details + saved settlement
export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const pw = searchParams.get("pw");
  if (pw !== ADMIN_PASSWORD) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const props = await liveProperties();

  if (searchParams.get("pending") === "1") {
    const tenants = allTenantsFrom(props);
    const pending = [];
    for (const t of tenants) {
      const s = await getReading("start", t.slug);
      if (s && s.isStartPending) {
        pending.push({ slug: t.slug, name: t.name, propertyName: t.propertyName || "", reading: s.reading, photoUrl: s.photoUrl || null, submittedAt: s.submittedAt });
      }
    }
    return Response.json({ pending });
  }

  const slug = searchParams.get("t");
  if (!slug) return Response.json({ error: "Missing tenant" }, { status: 400 });

  const found = findTenantIn(props, slug);
  if (!found) return Response.json({ error: "Unknown tenant" }, { status: 404 });

  const period = currentPeriod();
  const lastBill = await getLatestBillBefore(period, slug);
  const reading = await getReading(period, slug);
  const settlement = await getSettlement(slug);

  return Response.json({
    slug,
    name: found.tenant.name,
    propertyName: found.property.name,
    rate: found.property.rate || 9,
    rent: found.tenant.rent || 0,
    moveIn: found.tenant.moveIn || null,
    active: found.tenant.active !== false,
    lastReading: lastBill && lastBill.currentReading != null ? lastBill.currentReading
      : (found.tenant.startReading != null ? Number(found.tenant.startReading) : null),
    pendingReading: reading && reading.reading != null ? reading.reading : null,
    settlement: settlement || null,
  });
}
