"use client";
import { useState, useEffect } from "react";

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
function daysInMonth(y, m) { return new Date(y, m, 0).getDate(); }
function fmt(n) { return `₹${Math.round(n).toLocaleString("en-IN")}`; }

export default function CloseOut() {
  const [pw, setPw] = useState("");
  const [authed, setAuthed] = useState(false);
  const [tenants, setTenants] = useState([]);
  const [slug, setSlug] = useState("");
  const [info, setInfo] = useState(null);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  // form fields
  const [moveOut, setMoveOut] = useState("");
  const [finalReading, setFinalReading] = useState("");
  const [rentAdj, setRentAdj] = useState("");        // final rent (or refund if negative), owner-entered
  const [misc, setMisc] = useState("");
  const [miscNote, setMiscNote] = useState("");
  const [deposit, setDeposit] = useState("");
  const [deductions, setDeductions] = useState([]);  // [{amount, note}]
  const [carry, setCarry] = useState("");            // any prior balance (+they owe / -credit)
  const [paidUpTo, setPaidUpTo] = useState("");      // date rent is paid up to (advance)

  const themeVars = { "--paper":"#f6f2ea","--card":"#ffffff","--ink":"#232826","--muted":"#8a857a","--line":"#e7e0d4","--field":"#f6f2ea","--slate":"#3b6478","--accent":"#b06a3c","--good":"#3f7a52" };

  const loadTenants = async (password) => {
    try {
      const r = await fetch("/api/registry?pw=" + encodeURIComponent(password));
      if (!r.ok) { setErr("Wrong password"); return false; }
      const d = await r.json();
      const list = [];
      Object.values(d.properties || d || {}).forEach((p) => {
        if (!p || !Array.isArray(p.tenants)) return;
        p.tenants.forEach((t) => list.push({ slug: t.slug, name: t.name, property: p.name, active: t.active !== false }));
      });
      setTenants(list);
      return true;
    } catch { setErr("Could not load"); return false; }
  };

  const signIn = async () => {
    setErr("");
    const ok = await loadTenants(pw);
    if (ok) setAuthed(true);
  };

  const pickTenant = async (s) => {
    setSlug(s); setInfo(null); setMsg(""); setErr("");
    if (!s) return;
    const r = await fetch(`/api/settlement?t=${encodeURIComponent(s)}&pw=${encodeURIComponent(pw)}`);
    if (!r.ok) { setErr("Could not load tenant"); return; }
    const d = await r.json();
    setInfo(d);
    // prefill from saved settlement if any, else sensible defaults
    const st = d.settlement || {};
    setMoveOut(st.moveOut || "");
    setFinalReading(st.finalReading != null ? String(st.finalReading) : (d.pendingReading != null ? String(d.pendingReading) : ""));
    setRentAdj(st.rentAdj != null ? String(st.rentAdj) : "");
    setMisc(st.misc != null ? String(st.misc) : "");
    setMiscNote(st.miscNote || "");
    setDeposit(st.deposit != null ? String(st.deposit) : (d.rent ? String(d.rent) : ""));
    setDeductions(st.deductions || []);
    setCarry(st.carry != null ? String(st.carry) : "");
    setPaidUpTo(st.paidUpTo || "");
  };

  // ── derived settlement math ──
  const rate = info ? info.rate : 9;
  const prevReading = info ? info.lastReading : null;
  const units = (finalReading !== "" && prevReading != null) ? Math.max(0, Number(finalReading) - prevReading) : 0;
  const electricity = units * rate;
  const rentNum = rentAdj !== "" ? Number(rentAdj) : 0;
  const miscNum = misc !== "" ? Number(misc) : 0;
  const depositNum = deposit !== "" ? Number(deposit) : 0;
  const dedTotal = deductions.reduce((s, d) => s + (Number(d.amount) || 0), 0);
  const depositRefund = Math.max(0, depositNum - dedTotal); // returned to tenant
  const carryNum = carry !== "" ? Number(carry) : 0;
  // Final: charges owed by tenant minus what we refund to them.
  // charges = electricity + rent + misc + carry(if +ve owed) ; refund = depositRefund + (rent if negative means we owe)
  const charges = electricity + Math.max(0, rentNum) + miscNum + Math.max(0, carryNum);
  const credits = depositRefund + Math.max(0, -rentNum) + Math.max(0, -carryNum);
  const net = charges - credits; // +ve = tenant pays you ; -ve = you refund tenant

  // days-stayed guide + advance-rent unused-days refund guide
  let daysGuide = null;
  if (moveOut) {
    const d = new Date(moveOut);
    if (!isNaN(d)) {
      const dim = daysInMonth(d.getFullYear(), d.getMonth() + 1);
      const dailyRent = info && info.rent ? info.rent / dim : 0;
      daysGuide = { day: d.getDate(), dim, dailyRent, monthLabel: `${MONTHS[d.getMonth()]} ${d.getFullYear()}` };
    }
  }
  // Unused-days refund: they've paid in advance up to `paidUpTo`; they leave on `moveOut`.
  // Days between moveOut and paidUpTo (if paidUpTo is later) are unused → refundable.
  let refundGuide = null;
  if (moveOut && paidUpTo) {
    const mo = new Date(moveOut), pu = new Date(paidUpTo);
    if (!isNaN(mo) && !isNaN(pu) && info && info.rent) {
      const msPerDay = 86400000;
      const unusedDays = Math.round((pu - mo) / msPerDay);
      const dim = daysInMonth(mo.getFullYear(), mo.getMonth() + 1);
      const dailyRent = info.rent / dim;
      if (unusedDays > 0) {
        refundGuide = { unusedDays, amount: Math.round(unusedDays * dailyRent) };
      } else if (unusedDays < 0) {
        refundGuide = { unusedDays, owedDays: -unusedDays, amount: Math.round(unusedDays * dailyRent) };
      } else {
        refundGuide = { unusedDays: 0, amount: 0 };
      }
    }
  }

  const settlementObj = () => ({
    moveOut, finalReading: finalReading !== "" ? Number(finalReading) : null,
    paidUpTo,
    prevReading, units, rate, electricity,
    rentAdj: rentNum, misc: miscNum, miscNote,
    deposit: depositNum, deductions, depositRefund,
    carry: carryNum, net,
  });

  const save = async () => {
    setBusy(true); setMsg(""); setErr("");
    try {
      const r = await fetch("/api/readings", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "save-settlement", pw, slug, settlement: settlementObj() }) });
      if (!r.ok) throw new Error();
      setMsg("Settlement saved.");
    } catch { setErr("Could not save."); } finally { setBusy(false); }
  };

  const sendWhatsApp = () => {
    const lines = [];
    lines.push(`*Final Settlement — ${info.name}*`);
    if (info.propertyName) lines.push(info.propertyName);
    if (moveOut) lines.push(`Move-out: ${moveOut}`);
    lines.push("");
    if (units > 0) lines.push(`Electricity: ${units} units × ₹${rate} = ${fmt(electricity)}`);
    if (rentNum > 0) lines.push(`Rent: ${fmt(rentNum)}`);
    if (rentNum < 0) lines.push(`Rent refund: ${fmt(-rentNum)}`);
    if (miscNum) lines.push(`Misc${miscNote ? ` (${miscNote})` : ""}: ${fmt(miscNum)}`);
    if (carryNum) lines.push(`${carryNum > 0 ? "Previous balance" : "Previous credit"}: ${fmt(Math.abs(carryNum))}`);
    if (depositNum) {
      lines.push("");
      lines.push(`Deposit held: ${fmt(depositNum)}`);
      deductions.forEach((d) => { if (Number(d.amount)) lines.push(`  − ${fmt(Number(d.amount))}${d.note ? ` (${d.note})` : ""}`); });
      lines.push(`Deposit refund: ${fmt(depositRefund)}`);
    }
    lines.push("");
    lines.push(net >= 0 ? `*Amount payable by you: ${fmt(net)}*` : `*Amount refundable to you: ${fmt(-net)}*`);
    lines.push("");
    lines.push("Please review and let me know if anything needs correcting.");
    const text = encodeURIComponent(lines.join("\n"));
    window.open(`https://wa.me/?text=${text}`, "_blank");
  };

  const deactivate = async () => {
    if (!window.confirm(`Deactivate ${info.name}'s link? Do this only after the settlement is fully paid/refunded outside the app. Their history stays saved.`)) return;
    setBusy(true); setMsg(""); setErr("");
    try {
      const r = await fetch("/api/readings", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "deactivate-tenant", pw, slug }) });
      if (!r.ok) throw new Error();
      setMsg(`${info.name}'s link deactivated. Move-out complete.`);
      setInfo({ ...info, active: false });
      await loadTenants(pw);
    } catch { setErr("Could not deactivate."); } finally { setBusy(false); }
  };

  const L = { fontSize: 12, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: .5, display: "block", marginBottom: 4, marginTop: 12 };
  const I = { width: "100%", boxSizing: "border-box", border: "1px solid var(--line)", borderRadius: 10, padding: "11px 12px", fontSize: 16, background: "var(--field)", color: "var(--ink)" };
  const B = { width: "100%", border: "none", borderRadius: 11, padding: "13px 16px", fontWeight: 600, cursor: "pointer", marginTop: 10, fontSize: 14 };

  if (!authed) {
    return (
      <div style={{ ...themeVars, background: "var(--paper)", color: "var(--ink)", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
        <div style={{ width: "100%", maxWidth: 340, background: "var(--card)", border: "1px solid var(--line)", borderRadius: 16, padding: 24 }}>
          <h1 style={{ fontFamily: "Georgia, serif", fontSize: 22, margin: "0 0 16px", textAlign: "center" }}>Close-out sign in</h1>
          <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} onKeyDown={(e) => e.key === "Enter" && signIn()} placeholder="Admin password" style={I} />
          {err && <p style={{ color: "#c0392b", fontSize: 13 }}>{err}</p>}
          <button onClick={signIn} style={{ ...B, background: "var(--ink)", color: "var(--paper)" }}>Sign in</button>
          <a href="/admin" style={{ display: "block", textAlign: "center", marginTop: 12, color: "var(--slate)", fontSize: 13, textDecoration: "none" }}>← Back to admin</a>
        </div>
      </div>
    );
  }

  return (
    <div style={{ ...themeVars, background: "var(--paper)", color: "var(--ink)", minHeight: "100vh", padding: "20px 16px calc(60px + env(safe-area-inset-bottom))" }}>
      <div style={{ maxWidth: 480, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h1 style={{ fontFamily: "Georgia, serif", fontSize: 22, margin: 0 }}>Close out a tenant</h1>
          <a href="/admin" style={{ color: "var(--slate)", fontSize: 13, textDecoration: "none" }}>← Admin</a>
        </div>
        <p style={{ fontSize: 13, color: "var(--muted)", marginTop: 4 }}>Prepare a final settlement, send it to the tenant, and deactivate once settled.</p>

        <label style={L}>Tenant</label>
        <select value={slug} onChange={(e) => pickTenant(e.target.value)} style={I}>
          <option value="">Select a tenant…</option>
          {tenants.map((t) => <option key={t.slug} value={t.slug}>{t.name} · {t.property}{t.active ? "" : " (inactive)"}</option>)}
        </select>

        {err && <p style={{ color: "#c0392b", fontSize: 13 }}>{err}</p>}

        {info && (
          <div style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 14, padding: 16, marginTop: 16 }}>
            <div style={{ fontSize: 13, color: "var(--muted)" }}>{info.propertyName} · rate ₹{rate}/unit · monthly rent {fmt(info.rent)}</div>
            {!info.active && <div style={{ marginTop: 8, padding: "6px 10px", borderRadius: 8, background: "#f7ede4", color: "var(--accent)", fontSize: 13, fontWeight: 600 }}>This tenant's link is already deactivated.</div>}

            <label style={L}>Move-out date (last day)</label>
            <input type="date" value={moveOut} onChange={(e) => setMoveOut(e.target.value)} style={I} />
            {daysGuide && (
              <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 6 }}>
                Left on day {daysGuide.day} of {daysGuide.dim} in {daysGuide.monthLabel}. Daily rent ≈ {fmt(daysGuide.dailyRent)}.
              </div>
            )}

            <label style={L}>Rent paid in advance up to</label>
            <input type="date" value={paidUpTo} onChange={(e) => setPaidUpTo(e.target.value)} style={I} />
            <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>The last date their advance rent covers. Used to work out any refund for unused days.</div>
            {refundGuide && (
              <div style={{ fontSize: 13, marginTop: 8, padding: "10px 12px", borderRadius: 10, background: "#eef3f5", color: "var(--slate)" }}>
                {refundGuide.unusedDays > 0 ? (
                  <>They've paid for <b>{refundGuide.unusedDays}</b> unused day{refundGuide.unusedDays > 1 ? "s" : ""} after leaving ≈ <b>{fmt(refundGuide.amount)}</b> refund.
                    <button onClick={() => setRentAdj(String(-refundGuide.amount))} style={{ marginLeft: 8, border: "1px solid var(--line)", background: "#fff", color: "var(--slate)", borderRadius: 7, padding: "3px 8px", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>Use as refund</button></>
                ) : refundGuide.unusedDays < 0 ? (
                  <>They stayed <b>{refundGuide.owedDays}</b> day{refundGuide.owedDays > 1 ? "s" : ""} beyond what's paid ≈ <b>{fmt(-refundGuide.amount)}</b> owed.
                    <button onClick={() => setRentAdj(String(-refundGuide.amount))} style={{ marginLeft: 8, border: "1px solid var(--line)", background: "#fff", color: "var(--slate)", borderRadius: 7, padding: "3px 8px", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>Use as charge</button></>
                ) : (
                  <>Move-out lines up with paid-up date — no rent refund or charge.</>
                )}
              </div>
            )}

            <label style={L}>Final meter reading</label>
            <input inputMode="numeric" value={finalReading} onChange={(e) => setFinalReading(e.target.value.replace(/[^0-9.]/g, ""))} style={I} placeholder="e.g. 5300" />
            {prevReading != null && <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>Previous reading: <b>{prevReading}</b> → units: <b>{units}</b> → electricity: <b>{fmt(electricity)}</b></div>}

            <label style={L}>Final rent adjustment (₹) — negative = refund to tenant</label>
            <input value={rentAdj} onChange={(e) => setRentAdj(e.target.value.replace(/[^0-9.\-]/g, ""))} style={I} placeholder="e.g. -4000 (refund) or 3000 (owed)" />

            <label style={L}>Misc charge (₹)</label>
            <input inputMode="numeric" value={misc} onChange={(e) => setMisc(e.target.value.replace(/[^0-9.]/g, ""))} style={I} placeholder="0" />
            {misc !== "" && Number(misc) > 0 && <input value={miscNote} onChange={(e) => setMiscNote(e.target.value)} style={{ ...I, marginTop: 6 }} placeholder="Misc note (optional)" />}

            <label style={L}>Previous balance (₹) — +they owe / −credit</label>
            <input value={carry} onChange={(e) => setCarry(e.target.value.replace(/[^0-9.\-]/g, ""))} style={I} placeholder="0" />

            <label style={L}>Security deposit held (₹)</label>
            <input inputMode="numeric" value={deposit} onChange={(e) => setDeposit(e.target.value.replace(/[^0-9.]/g, ""))} style={I} placeholder="e.g. 30000" />
            <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>Defaults to one month's rent ({fmt(info.rent)}). Edit if this tenant's deposit differs.</div>

            {deposit !== "" && Number(deposit) > 0 && (
              <div style={{ marginTop: 10 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: .5 }}>Deductions from deposit</div>
                {deductions.map((d, i) => (
                  <div key={i} style={{ display: "flex", gap: 6, marginTop: 6 }}>
                    <input inputMode="numeric" value={d.amount} onChange={(e) => { const n = [...deductions]; n[i] = { ...n[i], amount: e.target.value.replace(/[^0-9.]/g, "") }; setDeductions(n); }} style={{ ...I, width: 90 }} placeholder="₹" />
                    <input value={d.note} onChange={(e) => { const n = [...deductions]; n[i] = { ...n[i], note: e.target.value }; setDeductions(n); }} style={{ ...I, flex: 1 }} placeholder="Reason (e.g. repainting)" />
                    <button onClick={() => setDeductions(deductions.filter((_, j) => j !== i))} style={{ border: "1px solid var(--line)", background: "var(--field)", color: "#c0392b", borderRadius: 8, padding: "0 10px", cursor: "pointer" }}>✕</button>
                  </div>
                ))}
                <button onClick={() => setDeductions([...deductions, { amount: "", note: "" }])} style={{ ...B, background: "var(--field)", color: "var(--slate)", border: "1px solid var(--line)", marginTop: 6, padding: 9 }}>+ Add deduction</button>
                <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 6 }}>Deductions: {fmt(dedTotal)} → deposit refund: <b>{fmt(depositRefund)}</b></div>
              </div>
            )}

            {/* Settlement summary */}
            <div style={{ marginTop: 16, padding: 14, borderRadius: 12, background: net >= 0 ? "#f7ede4" : "#eef3f5", border: "1px solid var(--line)" }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: .5 }}>Settlement</div>
              <div style={{ fontFamily: "Georgia, serif", fontSize: 24, marginTop: 4, color: "var(--ink)" }}>
                {net >= 0 ? `Tenant pays ${fmt(net)}` : `You refund ${fmt(-net)}`}
              </div>
            </div>

            {msg && <p style={{ color: "var(--good)", fontSize: 13, marginTop: 10 }}>{msg}</p>}

            <button onClick={save} disabled={busy} style={{ ...B, background: "var(--ink)", color: "var(--paper)" }}>{busy ? "Saving…" : "Save settlement"}</button>
            <button onClick={sendWhatsApp} style={{ ...B, background: "#25D366", color: "#fff" }}>Send to tenant on WhatsApp</button>
            <button onClick={deactivate} disabled={busy || !info.active} style={{ ...B, background: "#fff", color: info.active ? "#c0392b" : "var(--muted)", border: "1px solid var(--line)" }}>
              {info.active ? "Deactivate link (after settled)" : "Already deactivated"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
