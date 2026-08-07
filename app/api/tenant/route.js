import { liveProperties, findTenantIn } from "../../../lib/registry";
import { getReading, getBill } from "../../../lib/store";

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
  const submitted = !!(existing && !existing.unlockedForResubmit);

  // Gather this tenant's saved bills for the last 12 months → units per cycle.
  // Each bar's usage ran from the PREVIOUS reading to this one, so label it as a span
  // e.g. a reading taken in Aug (prev in Jul) covers "Jul–Aug".
  const found_bills = [];
  let [y, m] = period.split("-").map(Number);
  const months = [];
  for (let i = 0; i < 13; i++) { months.push(`${y}-${String(m).padStart(2, "0")}`); m -= 1; if (m < 1) { m = 12; y -= 1; } }
  months.reverse();
  for (const p of months) {
    const b = await getBill(p, slug);
    if (b && b.units != null) found_bills.push({ period: p, units: b.units });
  }
  const history = found_bills.map((b, i) => {
    const [yy, mm] = b.period.split("-").map(Number);
    const endLabel = MONTHS[mm - 1];
    // start month = previous reading's month if we have it, else one month before this
    let sy = yy, sm = mm - 1; if (sm < 1) { sm = 12; sy -= 1; }
    const startLabel = MONTHS[sm - 1];
    return { label: `${startLabel}–${endLabel}`, shortEnd: `${endLabel} ${String(yy).slice(2)}`, units: b.units };
  });
  const lastUnits = history.length ? history[history.length - 1].units : null;

  return Response.json({
    name: found.tenant.name,
    propertyName: found.property.name,
    active,
    submitted,
    reading: submitted ? existing.reading : null,
    submittedAt: submitted ? existing.submittedAt : null,
    history,      // [{label, units}] oldest→newest, up to 12 months
    lastUnits,    // most recent recorded units (for the first screen)
  });
}
