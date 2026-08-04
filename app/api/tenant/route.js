import { liveProperties, findTenantIn } from "../../../lib/registry";
import { getReading } from "../../../lib/store";

export const runtime = "nodejs";

function currentPeriod() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// GET /api/tenant?t=home-first  → { name, propertyName, submitted, reading, submittedAt }
// Public (no password): name to display + whether already submitted this month.
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

  return Response.json({
    name: found.tenant.name,
    propertyName: found.property.name,
    active,
    submitted,
    reading: submitted ? existing.reading : null,
    submittedAt: submitted ? existing.submittedAt : null,
  });
}
