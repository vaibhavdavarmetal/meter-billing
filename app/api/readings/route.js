import { put } from "@vercel/blob";
import {
  saveReading, getPeriodReadings, saveBill, getPeriodBills, getLatestBillBefore,
  getPeriodExtras, saveExtras,
} from "../../../lib/store";
import { ADMIN_PASSWORD } from "../../../lib/config";
import { liveProperties, allTenantsFrom, findTenantIn } from "../../../lib/registry";

export const runtime = "nodejs";

function currentPeriod() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export async function POST(req) {
  try {
    const body = await req.json();
    const props = await liveProperties();

    // Admin saving approved bills for a month
    if (body.action === "save-bill") {
      if (body.pw !== ADMIN_PASSWORD) return Response.json({ error: "Unauthorized" }, { status: 401 });
      const period = body.period || currentPeriod();
      for (const b of body.bills || []) {
        if (!findTenantIn(props, b.slug)) continue;
        await saveBill(period, b.slug, {
          slug: b.slug,
          propertyKey: b.propertyKey,
          previousReading: b.previousReading,
          currentReading: b.currentReading,
          units: b.units,
          electricity: b.electricity,
          rent: b.rent,
          misc: b.misc,
          amount: b.amount,
          photoUrl: b.photoUrl || null,
          savedAt: new Date().toISOString(),
        });
      }
      return Response.json({ ok: true, period });
    }

    // Admin saving per-month extras (rent/misc/paid) live as they edit
    if (body.action === "save-extras") {
      if (body.pw !== ADMIN_PASSWORD) return Response.json({ error: "Unauthorized" }, { status: 401 });
      const period = body.period || currentPeriod();
      const e = body.extras || {};
      if (!findTenantIn(props, body.slug)) return Response.json({ error: "Unknown tenant" }, { status: 404 });
      await saveExtras(period, body.slug, {
        rent: e.rent != null ? Number(e.rent) : null,
        misc: e.misc != null ? Number(e.misc) : null,
        miscNote: e.miscNote || "",
        paid: !!e.paid,
        updatedAt: new Date().toISOString(),
      });
      return Response.json({ ok: true });
    }

    // Tenant submitting a reading
    const { slug, reading, imageBase64, mediaType } = body;
    const period = body.period || currentPeriod();

    const found = findTenantIn(props, slug);
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

// Admin fetches all data for a period.
export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const pw = searchParams.get("pw");
  if (pw !== ADMIN_PASSWORD) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const props = await liveProperties();
  const period = searchParams.get("period") || currentPeriod();
  const slugs = allTenantsFrom(props).map((t) => t.slug);
  const readings = await getPeriodReadings(period, slugs);
  const bills = await getPeriodBills(period, slugs);
  const extras = await getPeriodExtras(period, slugs);

  const autoPrevious = {};
  for (const slug of slugs) {
    const last = await getLatestBillBefore(period, slug);
    autoPrevious[slug] = last ? last.currentReading : null;
  }

  return Response.json({ period, properties: props, readings, bills, extras, autoPrevious });
}
