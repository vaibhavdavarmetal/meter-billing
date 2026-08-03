import { ADMIN_PASSWORD } from "../../../lib/config";
import {
  getStaff, saveStaff, getPeriodStaffEntries, saveStaffEntry, getLatestStaffEntryBefore,
} from "../../../lib/store";

export const runtime = "nodejs";

function currentPeriod() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function newId() {
  return "staff_" + Math.random().toString(36).slice(2, 8);
}

// GET /api/staff?pw=...&period=2026-08
export async function GET(req) {
  const { searchParams } = new URL(req.url);
  if (searchParams.get("pw") !== ADMIN_PASSWORD) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const period = searchParams.get("period") || currentPeriod();
  const staff = (await getStaff()) || [];
  const ids = staff.map((s) => s.id);
  const entries = await getPeriodStaffEntries(period, ids);

  const carryIn = {};
  await Promise.all(ids.map(async (id) => {
    const last = await getLatestStaffEntryBefore(period, id);
    carryIn[id] = last && last.outstanding != null ? last.outstanding : 0;
  }));

  return Response.json({ period, staff, entries, carryIn });
}

// POST /api/staff
//   { action:"save-staff", pw, staff:[...] }
//   { action:"save-entry", pw, period, id, entry:{...} }
export async function POST(req) {
  try {
    const body = await req.json();
    if (body.pw !== ADMIN_PASSWORD) return Response.json({ error: "Unauthorized" }, { status: 401 });

    if (body.action === "save-staff") {
      const list = (body.staff || []).map((s) => ({
        id: s.id || newId(),
        name: s.name || "Unnamed",
        salary: Number(s.salary) || 0,
      }));
      await saveStaff(list);
      return Response.json({ ok: true, staff: list });
    }

    if (body.action === "save-entry") {
      const period = body.period || currentPeriod();
      const e = body.entry || {};
      await saveStaffEntry(period, body.id, {
        id: body.id,
        salary: Number(e.salary) || 0,
        extra: Number(e.extra) || 0,
        extraNote: e.extraNote || "",
        deduction: Number(e.deduction) || 0,
        deductionNote: e.deductionNote || "",
        carryIn: Number(e.carryIn) || 0,
        due: Number(e.due) || 0,           // salary + extra − deduction + carryIn
        paidAmount: e.paidAmount != null ? Number(e.paidAmount) : null,
        outstanding: e.outstanding != null ? Number(e.outstanding) : null, // due − paid, carries forward
        paid: !!e.paid,
        savedAt: new Date().toISOString(),
      });
      return Response.json({ ok: true });
    }

    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    return Response.json({ error: "Could not save" }, { status: 500 });
  }
}
