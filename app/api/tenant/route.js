import { liveProperties, findTenantIn } from "../../../lib/registry";
import { getReading, getBill, getBillsForPeriods } from "../../../lib/store";

export const runtime = "nodejs";

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function currentPeriod() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// GET /api/tenant?t=home-first
// Public (no password): name, submission status, and this tenant's own usage history.
export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const slug = searchParams.get("t");
  if (!slug) return Response.json({ error: "Missing tenant" }, { status: 400 });

  const props = await liveProperties();
  const found = findTenantIn(props, slug);
  if (!found) return Response.json({ error: "Unknown tenant" }, { status: 404 });

  const period = currentPeriod();
  const active = found.tenant.active !== false; // default active unless explicitly false
  const existing = active ? await getReading(period, slug) : null;
  // A finalized bill for this month means they've been billed → lock, even if the reading
  // was entered manually (e.g. tenant sent a WhatsApp screenshot, no app submission).
  const billThisMonth = active ? await getBill(period, slug) : null;
  const submitted = active && (
    (!!existing && !existing.unlockedForResubmit) ||
    (!!billThisMonth && billThisMonth.currentReading != null && !(existing && existing.unlockedForResubmit))
  );

  // Gather this tenant's saved bills for the last 13 months → units per cycle.
  // Fetch all months in PARALLEL (not one-by-one) and reuse the results.
  let [y, m] = period.split("-").map(Number);
  const months = [];
  for (let i = 0; i < 13; i++) { months.push(`${y}-${String(m).padStart(2, "0")}`); m -= 1; if (m < 1) { m = 12; y -= 1; } }
  months.reverse();
  const billByPeriod = await getBillsForPeriods(months, slug);

  const found_bills = [];
  months.forEach((p) => { const b = billByPeriod[p]; if (b && b.units != null) found_bills.push({ period: p, units: b.units }); });
  const history = found_bills.map((b) => {
    const [yy, mm] = b.period.split("-").map(Number);
    const endLabel = MONTHS[mm - 1];
    let sm = mm - 1; if (sm < 1) { sm = 12; }
    const startLabel = MONTHS[sm - 1];
    return { label: `${startLabel}–${endLabel}`, shortEnd: `${endLabel} ${String(yy).slice(2)}`, units: b.units };
  });
  const lastUnits = history.length ? history[history.length - 1].units : null;

  // Previous meter reading — reuse already-loaded bills (no extra fetches).
  let previousReading = null;
  for (let i = months.length - 1; i >= 0; i--) {
    const b = billByPeriod[months[i]];
    if (b && b.currentReading != null) { previousReading = b.currentReading; break; }
  }
  if (previousReading == null && found.tenant.startReading) previousReading = Number(found.tenant.startReading);

  // Dues: current month's bill is already loaded above.
  const currentBill = billByPeriod[period];
  let dues = null;
  if (currentBill && currentBill.amount != null) {
    const paid = !!currentBill.paid;
    const outstanding = currentBill.outstanding != null ? currentBill.outstanding : (paid ? 0 : currentBill.amount);
    dues = {
      amount: currentBill.amount,
      paid,
      outstanding,
      carryIn: currentBill.carryIn || 0,
      status: paid ? "paid" : (outstanding > 0 ? "pending" : outstanding < 0 ? "overpaid" : "pending"),
    };
  }

  // Maintenance contacts for this tenant's property (managed in admin).
  const contacts = (found.property.contacts || []).filter((c) => c && c.name && c.phone);

  return Response.json({
    name: found.tenant.name,
    propertyName: found.property.name,
    active,
    submitted,
    reading: submitted ? (existing ? existing.reading : (billThisMonth ? billThisMonth.currentReading : null)) : null,
    submittedAt: submitted ? (existing ? existing.submittedAt : (billThisMonth ? billThisMonth.savedAt : null)) : null,
    history,
    lastUnits,
    previousReading,   // last meter reading, shown upfront
    dues,              // finalized dues for this month, or null
    contacts,          // [{label,name,phone}] for maintenance card
  });
}
