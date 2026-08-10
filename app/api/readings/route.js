import { put } from "@vercel/blob";
import {
  saveReading, getReading, getPeriodReadings, saveBill, getPeriodBills, getLatestBillBefore,
  getPeriodExtras, saveExtras, getPeriodApprovals, saveApproval,
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

    if (body.action === "save-bill") {
      if (body.pw !== ADMIN_PASSWORD) return Response.json({ error: "Unauthorized" }, { status: 401 });
      const period = body.period || currentPeriod();
      for (const b of body.bills || []) {
        if (!findTenantIn(props, b.slug)) continue;
        await saveBill(period, b.slug, {
          slug: b.slug, propertyKey: b.propertyKey,
          previousReading: b.previousReading, currentReading: b.currentReading,
          units: b.units, electricity: b.electricity, rent: b.rent, misc: b.misc,
          carryIn: b.carryIn || 0,          // balance brought from last month (+owed / -credit)
          amount: b.amount,                  // electricity + rent + misc + carryIn = amount due
          paidAmount: b.paidAmount != null ? b.paidAmount : null, // what they actually paid
          outstanding: b.outstanding != null ? b.outstanding : null, // amount - paidAmount, carries forward
          paid: !!b.paid,
          photoUrl: b.photoUrl || null, savedAt: new Date().toISOString(),
        });
        // If the tenant never submitted through the app (e.g. sent a WhatsApp screenshot and the
        // owner entered it manually), lock their link for this month so they can't also submit.
        if (b.currentReading != null) {
          const existingReading = await getReading(period, b.slug);
          if (!existingReading) {
            await saveReading(period, b.slug, {
              slug: b.slug, reading: Number(b.currentReading),
              enteredByAdmin: true, photoUrl: b.photoUrl || null,
              submittedAt: new Date().toISOString(),
            });
          }
        }
      }
      return Response.json({ ok: true, period });
    }

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

    // Save or clear an approval (persists across refresh)
    if (body.action === "save-approval") {
      if (body.pw !== ADMIN_PASSWORD) return Response.json({ error: "Unauthorized" }, { status: 401 });
      const period = body.period || currentPeriod();
      if (!findTenantIn(props, body.slug)) return Response.json({ error: "Unknown tenant" }, { status: 404 });
      await saveApproval(period, body.slug, body.approval
        ? { approved: true, previousReading: body.previousReading, currentReading: body.currentReading, approvedAt: new Date().toISOString() }
        : null);
      return Response.json({ ok: true });
    }

    // Admin reset/unlock: keep the old reading but mark it reset so the tenant can submit again
    if (body.action === "reset-submission") {
      if (body.pw !== ADMIN_PASSWORD) return Response.json({ error: "Unauthorized" }, { status: 401 });
      const period = body.period || currentPeriod();
      if (!findTenantIn(props, body.slug)) return Response.json({ error: "Unknown tenant" }, { status: 404 });
      const existing = await getReading(period, body.slug);
      if (existing) {
        await saveReading(period, body.slug, { ...existing, unlockedForResubmit: true, unlockedAt: new Date().toISOString() });
      } else {
        // No reading record (bill was entered manually) — write an unlock marker so the
        // bill-based lock releases and the tenant can submit fresh.
        await saveReading(period, body.slug, { slug: body.slug, unlockedForResubmit: true, unlockedAt: new Date().toISOString(), reading: null });
      }
      return Response.json({ ok: true });
    }

    // Tenant submitting a reading
    const { slug, reading, imageBase64, mediaType } = body;
    const period = body.period || currentPeriod();
    const found = findTenantIn(props, slug);
    if (!found) return Response.json({ error: "Unknown tenant" }, { status: 404 });
    if (found.tenant.active === false) return Response.json({ error: "inactive" }, { status: 403 });

    // Lock: if already submitted for this month and not unlocked, reject.
    const existing = await getReading(period, slug);
    if (existing && !existing.unlockedForResubmit) {
      return Response.json({ error: "already-submitted", submittedAt: existing.submittedAt, reading: existing.reading }, { status: 409 });
    }

    let photoUrl = null;
    if (imageBase64 && process.env.BLOB_READ_WRITE_TOKEN) {
      const buf = Buffer.from(imageBase64, "base64");
      const blob = await put(`meters/${period}/${slug}.jpg`, buf, {
        access: "public", contentType: mediaType || "image/jpeg", addRandomSuffix: true,
      });
      photoUrl = blob.url;
    }

    await saveReading(period, slug, {
      slug, reading: Number(reading),
      aiReading: body.aiReading != null ? Number(body.aiReading) : null,
      aiConfidence: body.aiConfidence || null,
      photoUrl, submittedAt: new Date().toISOString(),
      // keep prior photo url as evidence when this is a resubmission
      previousPhotoUrl: existing && existing.photoUrl ? existing.photoUrl : (existing && existing.previousPhotoUrl) || null,
    });
    return Response.json({ ok: true, period });
  } catch (e) {
    return Response.json({ error: "Could not save" }, { status: 500 });
  }
}

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const pw = searchParams.get("pw");
  if (pw !== ADMIN_PASSWORD) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const props = await liveProperties();
  const period = searchParams.get("period") || currentPeriod();
  const slugs = allTenantsFrom(props).map((t) => t.slug);
  const [readings, bills, extras, approvals] = await Promise.all([
    getPeriodReadings(period, slugs),
    getPeriodBills(period, slugs),
    getPeriodExtras(period, slugs),
    getPeriodApprovals(period, slugs),
  ]);

  const autoPrevious = {};
  const carryIn = {};
  await Promise.all(slugs.map(async (slug) => {
    const last = await getLatestBillBefore(period, slug);
    if (last) {
      autoPrevious[slug] = last.currentReading;
      carryIn[slug] = last.outstanding != null ? last.outstanding : 0;
    } else {
      // No prior bill — seed previous reading from the tenant's startReading (diary value)
      const found = findTenantIn(props, slug);
      const sr = found && found.tenant.startReading ? Number(found.tenant.startReading) : null;
      autoPrevious[slug] = sr;
      carryIn[slug] = 0;
    }
  }));

  return Response.json({ period, properties: props, readings, bills, extras, approvals, autoPrevious, carryIn });
}
