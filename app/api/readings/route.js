import { put } from "@vercel/blob";
import { saveReading, getPeriodReadings, saveBill, getPeriodBills, getLatestBillBefore } from "../../../lib/store";
import { findTenant, allTenants, PROPERTIES, ADMIN_PASSWORD } from "../../../lib/config";

export const runtime = "nodejs";

// Current billing period, e.g. "2026-07"
function currentPeriod() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// POST handles two things:
//  - tenant submitting a reading (default)
//  - admin saving an approved bill: { action:"save-bill", pw, period, bills:[...] }
export async function POST(req) {
  try {
    const body = await req.json();

    // Admin saving approved bills for a month
    if (body.action === "save-bill") {
      if (body.pw !== ADMIN_PASSWORD) return Response.json({ error: "Unauthorized" }, { status: 401 });
      const period = body.period || currentPeriod();
      for (const b of body.bills || []) {
        if (!findTenant(b.slug)) continue;
        await saveBill(period, b.slug, {
          slug: b.slug,
          propertyKey: b.propertyKey,
          previousReading: b.previousReading,
          currentReading: b.currentReading,
          units: b.units,
          amount: b.amount,
          photoUrl: b.photoUrl || null,
          savedAt: new Date().toISOString(),
        });
      }
      return Response.json({ ok: true, period });
    }

    // Tenant submitting a reading
    const { slug, reading, imageBase64, mediaType } = body;
    const period = body.period || currentPeriod();

    const found = findTenant(slug);
    if (!found) return Response.json({ error: "Unknown tenant" }, { status: 404 });

    let photoUrl = null;
    if (imageBase64 && process.env.BLOB_READ_WRITE_TOKEN) {
      const buf = Buffer.from(imageBase64, "base64");
      const blob = await put(`meters/${period}/${slug}.jpg`, buf, {
        access: "public",
        contentType: mediaType || "image/jpeg",
        addRandomSuffix: true,
      });
      photoUrl = blob.url;
    }

    await saveReading(period, slug, {
      slug,
      reading: Number(reading),
      aiReading: body.aiReading != null ? Number(body.aiReading) : null,
      aiConfidence: body.aiConfidence || null,
      photoUrl,
      submittedAt: new Date().toISOString(),
    });

    return Response.json({ ok: true, period });
  } catch (e) {
    return Response.json({ error: "Could not save" }, { status: 500 });
  }
}

// Admin fetches all data for a period: /api/readings?period=2026-07&pw=...
// Returns: live readings (this month's submissions), saved bills (history),
// and an auto "previous" reading pulled from each tenant's last saved bill.
export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const pw = searchParams.get("pw");
  if (pw !== ADMIN_PASSWORD) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const period = searchParams.get("period") || currentPeriod();
  const slugs = allTenants().map((t) => t.slug);
  const readings = await getPeriodReadings(period, slugs);
  const bills = await getPeriodBills(period, slugs);

  const autoPrevious = {};
  for (const slug of slugs) {
    const last = await getLatestBillBefore(period, slug);
    autoPrevious[slug] = last ? last.currentReading : null;
  }

  return Response.json({ period, properties: PROPERTIES, readings, bills, autoPrevious });
}
