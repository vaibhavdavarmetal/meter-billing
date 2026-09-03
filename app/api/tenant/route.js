import { liveProperties, findTenantIn } from "../../../lib/registry";
import { getReading, getBillsForPeriods, getSettlement } from "../../../lib/store";
import { OWNER_WHATSAPP } from "../../../lib/config";

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

  // Build the 13-month window and fetch the reading + all bills in PARALLEL (no sequential waits).
  let [y, m] = period.split("-").map(Number);
  const months = [];
  for (let i = 0; i < 13; i++) { months.push(`${y}-${String(m).padStart(2, "0")}`); m -= 1; if (m < 1) { m = 12; y -= 1; } }
  months.reverse();

  const [existing, billByPeriod] = await Promise.all([
    active ? getReading(period, slug) : Promise.resolve(null),
    getBillsForPeriods(months, slug),
  ]);
  // Current month's bill comes from the batch — no separate fetch.
  const billThisMonth = active ? (billByPeriod[period] || null) : null;
  const submitted = active && (
    (!!existing && !existing.unlockedForResubmit) ||
    (!!billThisMonth && billThisMonth.currentReading != null && !(existing && existing.unlockedForResubmit))
  );

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

  // Onboarding: a brand-new tenant has no start reading, no bills, and no reading yet.
  // Their first submission is the move-in baseline (pending owner verification).
  const hasAnyBill = months.some((p) => { const b = billByPeriod[p]; return b && b.amount != null; });
  const hasStart = found.tenant.startReading != null && Number(found.tenant.startReading) > 0;
  const startPending = active && !hasStart ? await getReading("start", slug) : null;
  const startSubmitted = !!(startPending && startPending.isStartPending);
  const awaitingStart = active && !hasStart && !hasAnyBill && !existing && !startSubmitted;

  // Settling-in: baseline is confirmed but we're still within the move-in month and no bill
  // exists yet. The dashboard stays calm until the 1st of the next month.
  const settlingIn = active && hasStart && !hasAnyBill && found.tenant.startMonth === period;

  // Dues: current month's bill is already loaded above.
  const currentBill = billByPeriod[period];
  let dues = null;
  if (currentBill && currentBill.amount != null) {
    const paid = !!currentBill.paid;
    const outstanding = currentBill.outstanding != null ? currentBill.outstanding : (paid ? 0 : currentBill.amount);
    // Status reflects THIS month only: paid = settled, else pending.
    const status = paid ? "paid" : (outstanding > 0 ? "pending" : "pending");
    // If paid but the amount differed, it's not an unpaid balance — it's an adjustment
    // that carries into the next bill. Surface it separately from status.
    let adjustment = 0;
    if (paid && currentBill.outstanding != null && currentBill.outstanding !== 0) {
      adjustment = currentBill.outstanding; // +ve = short (added next bill), -ve = extra (credit next bill)
    }
    dues = {
      amount: currentBill.amount,
      paid,
      outstanding,
      adjustment,
      carryIn: currentBill.carryIn || 0,
      electricity: currentBill.electricity || 0,
      rent: currentBill.rent || 0,
      misc: currentBill.misc || 0,
      paidAmount: currentBill.paidAmount != null ? currentBill.paidAmount : (paid ? currentBill.amount : null),
      status,
    };
  }

  // Maintenance contacts for this tenant's property (managed in admin).
  const contacts = (found.property.contacts || []).filter((c) => c && c.name && c.phone);

  // Move-out: owner flags the tenant, tenant submits a final reading, owner settles.
  const movingOut = active && found.tenant.movingOut === true;
  const [finalRec, settlementRec] = await Promise.all([
    getReading("final", slug),
    getSettlement(slug),
  ]);
  const finalSubmitted = movingOut && !!(finalRec && finalRec.isFinalPending);
  const finalReading = finalRec && finalRec.isFinalPending ? finalRec.reading : null;
  let settlement = null;
  if (settlementRec && settlementRec.net != null) {
    settlement = {
      net: settlementRec.net,
      electricity: settlementRec.electricity || 0,
      units: settlementRec.units || 0,
      rentAdj: settlementRec.rentAdj || 0,
      misc: settlementRec.misc || 0,
      deposit: settlementRec.deposit || 0,
      depositRefund: settlementRec.depositRefund || 0,
      moveOut: settlementRec.moveOut || null,
      savedAt: settlementRec.savedAt || null,
    };
  }

  // Month-start reminder: if there's no finalized bill for THIS month yet, look at the most
  // recent finalized bill to carry forward any over/under adjustment (credit or shortfall).
  let reminder = null;
  if (!dues) {
    let lastBill = null;
    for (let i = months.length - 1; i >= 0; i--) {
      if (months[i] === period) continue; // skip current (unbilled) month
      const b = billByPeriod[months[i]];
      if (b && b.amount != null) { lastBill = b; break; }
    }
    // Carried adjustment: +ve = they still owe (shortfall), -ve = credit (overpaid)
    let carried = 0;
    if (lastBill && lastBill.outstanding != null && lastBill.outstanding !== 0) carried = lastBill.outstanding;
    reminder = { rentDue: true, carried };
  }

  return Response.json({
    name: found.tenant.name,
    propertyName: found.property.name,
    isTest: found.property.isTest === true, // practice property: bill auto-generates on submit
    active,
    submitted,
    // Reading to show: the admin-approved bill's currentReading is authoritative once a bill
    // exists (owner verifies/corrects on approve). Fall back to the tenant's raw submission
    // only when there's no finalized bill yet.
    reading: submitted
      ? ((billThisMonth && billThisMonth.currentReading != null)
          ? billThisMonth.currentReading
          : (existing ? existing.reading : null))
      : null,
    submittedAt: submitted ? (existing ? existing.submittedAt : (billThisMonth ? billThisMonth.savedAt : null)) : null,
    history,
    lastUnits,
    previousReading,   // last meter reading, shown upfront
    awaitingStart,     // true = new tenant needs to submit move-in baseline first
    startSubmitted,    // true = baseline submitted, awaiting owner confirmation
    settlingIn,        // true = baseline confirmed, still in move-in month, dashboard opens next month
    dues,              // finalized dues for this month, or null
    reminder,          // month-start reminder (rent due + carried adjustment) when no bill yet
    contacts,          // [{label,name,phone}] for maintenance card
    movingOut,         // true = owner started move-out; app unlocks a final reading
    finalSubmitted,    // true = tenant submitted the final reading, awaiting settlement
    finalReading,      // the submitted final reading value
    settlement,        // owner-prepared final settlement summary, or null
    ownerWhatsapp: OWNER_WHATSAPP && !OWNER_WHATSAPP.includes("X") ? OWNER_WHATSAPP : null,
  });
}
