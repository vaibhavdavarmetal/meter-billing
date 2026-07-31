import { put } from "@vercel/blob";
import { saveReading, getPeriodReadings } from "../../../lib/store";
import { findTenant, allTenants, PROPERTIES, ADMIN_PASSWORD } from "../../../lib/config";

export const runtime = "nodejs";

// Current billing period, e.g. "2026-07"
function currentPeriod() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// Tenant submits: { slug, reading, imageBase64, mediaType, period? }
export async function POST(req) {
  try {
    const body = await req.json();
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

// Admin fetches all readings for a period: /api/readings?period=2026-07&pw=...
export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const pw = searchParams.get("pw");
  if (pw !== ADMIN_PASSWORD) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const period = searchParams.get("period") || currentPeriod();
  const slugs = allTenants().map((t) => t.slug);
  const readings = await getPeriodReadings(period, slugs);

  return Response.json({ period, properties: PROPERTIES, readings });
}
