import { put } from "@vercel/blob";
import {
  saveReading, getReading, getPeriodReadings, saveBill, getPeriodBills, getLatestBillBefore,
  getPeriodExtras, getExtras, saveExtras, getPeriodApprovals, saveApproval,
  getSettlement, saveSettlement, getRegistry, saveRegistry,
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

    if (body.action === "confirm-start") {
      if (body.pw !== ADMIN_PASSWORD) return Response.json({ error: "Unauthorized" }, { status: 401 });
      if (!findTenantIn(props, body.slug)) return Response.json({ error: "Unknown tenant" }, { status: 404 });
      const pending = await getReading("start", body.slug);
      const reg = await getRegistry();
      if (reg) {
        for (const p of Object.values(reg)) {
          if (!Array.isArray(p.tenants)) continue;
          const t = p.tenants.find((x) => x.slug === body.slug);
          if (t) {
            t.startReading = Number(body.reading);
            if (pending && pending.photoUrl) t.startPhotoUrl = pending.photoUrl;
            // Record the move-in month so the tenant dashboard opens fully only next month.
            const now = new Date();
            t.startMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
            break;
          }
        }
        await saveRegistry(reg);
      }
      // clear the pending marker
      await saveReading("start", body.slug, { slug: body.slug, isStartPending: false, confirmedReading: Number(body.reading), confirmedAt: new Date().toISOString() });
      return Response.json({ ok: true });
    }

    if (body.action === "save-settlement") {
      if (body.pw !== ADMIN_PASSWORD) return Response.json({ error: "Unauthorized" }, { status: 401 });
      if (!findTenantIn(props, body.slug)) return Response.json({ error: "Unknown tenant" }, { status: 404 });
      await saveSettlement(body.slug, { ...body.settlement, slug: body.slug, savedAt: new Date().toISOString() });
      return Response.json({ ok: true });
    }

    if (body.action === "deactivate-tenant") {
      if (body.pw !== ADMIN_PASSWORD) return Response.json({ error: "Unauthorized" }, { status: 401 });
      const reg = await getRegistry();
      if (!reg) return Response.json({ error: "No registry" }, { status: 404 });
      let done = false;
      for (const p of Object.values(reg)) {
        if (!Array.isArray(p.tenants)) continue;
        const t = p.tenants.find((x) => x.slug === body.slug);
        if (t) { t.active = false; t.movingOut = false; done = true; break; }
      }
      if (!done) return Response.json({ error: "Tenant not found" }, { status: 404 });
      await saveRegistry(reg);
      return Response.json({ ok: true });
    }

    // Owner flips a tenant into (or out of) move-out mode. Unlocks their app to submit a
    // final reading; no settlement data is entered here.
    if (body.action === "start-moveout" || body.action === "cancel-moveout") {
      if (body.pw !== ADMIN_PASSWORD) return Response.json({ error: "Unauthorized" }, { status: 401 });
      const reg = (await getRegistry()) || props;
      let done = false;
      for (const p of Object.values(reg)) {
        if (!Array.isArray(p.tenants)) continue;
        const t = p.tenants.find((x) => x.slug === body.slug);
        if (t) { t.movingOut = body.action === "start-moveout"; done = true; break; }
      }
      if (!done) return Response.json({ error: "Tenant not found" }, { status: 404 });
      // Starting fresh clears any stale final reading from a previous attempt.
      if (body.action === "start-moveout") await saveReading("final", body.slug, { slug: body.slug, isFinalPending: false });
      await saveRegistry(reg);
      return Response.json({ ok: true });
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

    // Un-approve: clear BOTH the approval and the saved bill. Without clearing the bill,
    // a refresh would re-approve (any saved bill counts as approved on reload).
    if (body.action === "unapprove") {
      if (body.pw !== ADMIN_PASSWORD) return Response.json({ error: "Unauthorized" }, { status: 401 });
      const period = body.period || currentPeriod();
      if (!findTenantIn(props, body.slug)) return Response.json({ error: "Unknown tenant" }, { status: 404 });
      await saveApproval(period, body.slug, null);
      await saveBill(period, body.slug, null);
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

    // Move-in baseline: save the tenant's onboarding submission as a PENDING starting reading
    // (with photo) for the owner to verify. It does NOT set startReading directly.
    if (body.isStart) {
      const hasStart = found.tenant.startReading != null && Number(found.tenant.startReading) > 0;
      if (!hasStart) {
        let startPhotoUrl = null;
        if (imageBase64 && process.env.BLOB_READ_WRITE_TOKEN) {
          const buf = Buffer.from(imageBase64, "base64");
          const blob = await put(`meters/start/${slug}.jpg`, buf, { access: "public", contentType: mediaType || "image/jpeg", addRandomSuffix: true });
          startPhotoUrl = blob.url;
        }
        await saveReading("start", slug, {
          slug, reading: Number(reading), photoUrl: startPhotoUrl,
          isStartPending: true, submittedAt: new Date().toISOString(),
        });
        return Response.json({ ok: true, start: true, reading: Number(reading) });
      }
      // already has a baseline — fall through to normal handling
    }

    // Move-out: the tenant's FINAL reading on their last day. Saved separately (keyed "final")
    // so it bypasses the monthly lock; the owner settles from it in the console.
    if (body.isFinal && found.tenant.movingOut) {
      let finalPhotoUrl = null;
      if (imageBase64 && process.env.BLOB_READ_WRITE_TOKEN) {
        const buf = Buffer.from(imageBase64, "base64");
        const blob = await put(`meters/final/${slug}.jpg`, buf, { access: "public", contentType: mediaType || "image/jpeg", addRandomSuffix: true });
        finalPhotoUrl = blob.url;
      }
      await saveReading("final", slug, {
        slug, reading: Number(reading), photoUrl: finalPhotoUrl,
        isFinalPending: true, submittedAt: new Date().toISOString(),
      });
      return Response.json({ ok: true, final: true, reading: Number(reading) });
    }

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

    // Practice property only: auto-generate the bill on submit (no owner approval step).
    // The owner still verifies the photo and marks it paid in the console. Guarded to
    // isTest so real properties keep the manual approve flow.
    if (found.property.isTest) {
      const last = await getLatestBillBefore(period, slug);
      const previousReading = last && last.currentReading != null ? Number(last.currentReading)
        : (found.tenant.startReading ? Number(found.tenant.startReading) : 0);
      const carryIn = last && last.outstanding != null ? Number(last.outstanding) : 0;
      const cur = Number(reading);
      const units = Math.round(Math.max(0, cur - previousReading) * 10) / 10;
      const rate = Number(found.property.rate) || 0;
      const electricity = Math.round(units * rate);
      const ex = await getExtras(period, slug);
      const rent = ex && ex.rent != null ? Number(ex.rent) : (found.tenant.rent ? Number(found.tenant.rent) : 0);
      const misc = ex && ex.misc != null ? Number(ex.misc) : (found.tenant.misc ? Number(found.tenant.misc) : 0);
      const amount = Math.round(electricity + rent + misc + carryIn);
      const bill = {
        slug, propertyKey: found.propertyKey,
        previousReading, currentReading: cur, units,
        electricity, rent, misc, carryIn: Math.round(carryIn),
        amount, paidAmount: null, outstanding: null, paid: false,
        photoUrl, savedAt: new Date().toISOString(), autoGenerated: true,
      };
      await saveBill(period, slug, bill);
      return Response.json({ ok: true, period, bill });
    }

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
