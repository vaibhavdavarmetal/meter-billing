import { ADMIN_PASSWORD } from "../../../lib/config";
import { liveProperties, allTenantsFrom } from "../../../lib/registry";
import { getBill, getStaff, getStaffEntry } from "../../../lib/store";

export const runtime = "nodejs";

function csvEscape(v) {
  if (v == null) return "";
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// GET /api/report?pw=...&scope=month&period=2026-08
//     /api/report?pw=...&scope=year&year=2026
export async function GET(req) {
  const { searchParams } = new URL(req.url);
  if (searchParams.get("pw") !== ADMIN_PASSWORD) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const scope = searchParams.get("scope") || "month";
  const props = await liveProperties();
  const tenants = allTenantsFrom(props);

  // Which periods to include
  let periods = [];
  if (scope === "year") {
    const year = searchParams.get("year") || String(new Date().getFullYear());
    for (let m = 1; m <= 12; m++) periods.push(`${year}-${String(m).padStart(2, "0")}`);
  } else {
    periods = [searchParams.get("period") || ""];
  }

  const header = ["Month","Property","Tenant","Previous","Current","Units","Rate","Electricity","Rent","Misc","Adjustment","Total due","Paid","Outstanding","Status"];
  const rows = [header];

  for (const period of periods) {
    if (!period) continue;
    for (const t of tenants) {
      const b = await getBill(period, t.slug);
      if (!b) continue;
      const prop = props[t.propertyKey];
      rows.push([
        period, t.propertyName, t.name,
        b.previousReading, b.currentReading, b.units, prop ? prop.rate : "",
        b.electricity, b.rent, b.misc, b.carryIn || 0, b.amount,
        b.paidAmount != null ? b.paidAmount : "", b.outstanding != null ? b.outstanding : "",
        b.paid ? "Paid" : "Unpaid",
      ]);
    }
  }

  // ── House help section ──
  const staff = (await getStaff()) || [];
  if (staff.length > 0) {
    rows.push([]); // blank separator row
    rows.push(["House help"]);
    rows.push(["Month","Name","Salary","Extra","Deduction","Adjustment","Amount due","Paid","Outstanding","Status"]);
    for (const period of periods) {
      if (!period) continue;
      for (const s of staff) {
        const e = await getStaffEntry(period, s.id);
        if (!e) continue;
        rows.push([
          period, s.name, e.salary, e.extra, e.deduction, e.carryIn || 0, e.due,
          e.paidAmount != null ? e.paidAmount : "", e.outstanding != null ? e.outstanding : "",
          e.paid ? "Paid" : "Unpaid",
        ]);
      }
    }
  }

  const csv = rows.map((r) => r.map(csvEscape).join(",")).join("\n");
  const filename = scope === "year"
    ? `report-${searchParams.get("year") || "year"}.csv`
    : `report-${searchParams.get("period") || "month"}.csv`;

  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
