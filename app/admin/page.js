"use client";
import { useState, useEffect, useCallback } from "react";

function money(n) {
  if (n == null || !isFinite(n)) return "—";
  return "₹" + Math.round(n).toLocaleString("en-IN");
}
function thisPeriod() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
function label(period) {
  const [y, m] = period.split("-").map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}
function shiftPeriod(period, delta) {
  let [y, m] = period.split("-").map(Number);
  m += delta;
  while (m < 1) { m += 12; y -= 1; }
  while (m > 12) { m -= 12; y += 1; }
  return `${y}-${String(m).padStart(2, "0")}`;
}

export default function Admin() {
  const [pw, setPw] = useState("");
  const [authed, setAuthed] = useState(false);
  const [period, setPeriod] = useState(thisPeriod());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const [prev, setPrev] = useState({});       // slug -> previous reading (auto or typed)
  const [override, setOverride] = useState({});// slug -> corrected current reading
  const [approved, setApproved] = useState({});// slug -> true
  const [totalBill, setTotalBill] = useState({}); // propertyKey -> actual bill
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState("");

  const fetchPeriod = useCallback(async (p, password) => {
    setLoading(true); setErr("");
    try {
      const res = await fetch(`/api/readings?period=${p}&pw=${encodeURIComponent(password)}`);
      if (res.status === 401) { setErr("Wrong password."); setLoading(false); return false; }
      if (!res.ok) throw new Error();
      const d = await res.json();
      setData(d);
      // Seed previous readings from autoPrevious (last month's saved current)
      const seededPrev = {};
      Object.entries(d.autoPrevious || {}).forEach(([slug, v]) => { if (v != null) seededPrev[slug] = String(v); });
      setPrev(seededPrev);
      setOverride({});
      setApproved({});
      setSavedMsg("");
      setLoading(false);
      return true;
    } catch {
      setErr("Could not load."); setLoading(false); return false;
    }
  }, []);

  const login = async () => {
    const ok = await fetchPeriod(period, pw);
    if (ok) setAuthed(true);
  };

  const changeMonth = async (delta) => {
    const p = shiftPeriod(period, delta);
    setPeriod(p);
    await fetchPeriod(p, pw);
  };

  const waText = (propName, tName, prevV, currV, units, amount, mode, extra) => {
    const base = `Electricity bill — ${label(period)}\n${propName} · ${tName}\n\nPrevious: ${prevV}\nCurrent: ${currV}\nUnits used: ${units}\n`;
    const tail = mode === "rate"
      ? `Rate: ₹${extra}/unit\n\nAmount payable: ${money(amount)}`
      : `Share of total bill (${money(extra)})\n\nAmount payable: ${money(amount)}`;
    return base + tail;
  };

  // ── LOGIN SCREEN ──────────────────────────────────────────
  if (!authed) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
        <div style={{ width: "100%", maxWidth: 340, background: "#fff", border: "1px solid #e4ddd0", borderRadius: 16, padding: 24 }}>
          <div style={{ fontSize: 11, letterSpacing: 2, textTransform: "uppercase", color: "#a8613c", fontWeight: 700 }}>Electricity ledger</div>
          <h1 style={{ fontFamily: "Georgia, serif", fontSize: 24, margin: "4px 0 18px" }}>Admin sign in</h1>
          <label style={lbl}>Password</label>
          <input type="password" value={pw} onChange={(e) => setPw(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && login()} style={inp} placeholder="Enter admin password" autoFocus />
          {err && <p style={{ color: "#c0392b", fontSize: 14 }}>{err}</p>}
          <button onClick={login} style={btn} disabled={loading}>{loading ? "Checking…" : "Sign in"}</button>
        </div>
      </div>
    );
  }

  // ── MAIN ADMIN VIEW ───────────────────────────────────────
  return (
    <div style={{ maxWidth: 560, margin: "0 auto", padding: "20px 16px 48px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <h1 style={{ fontFamily: "Georgia, serif", fontSize: 22, margin: 0 }}>Billing</h1>
        <div style={{ display: "flex", alignItems: "center", gap: 4, background: "#fff", border: "1px solid #e4ddd0", borderRadius: 10, padding: 4 }}>
          <button onClick={() => changeMonth(-1)} style={stepBtn} aria-label="Previous month">‹</button>
          <div style={{ fontSize: 14, fontWeight: 600, minWidth: 84, textAlign: "center" }}>{label(period)}</div>
          <button onClick={() => changeMonth(1)} style={stepBtn} aria-label="Next month">›</button>
        </div>
      </div>

      {loading && <p style={{ color: "#8a8375" }}>Loading {label(period)}…</p>}

      {data && Object.entries(data.properties).map(([pkey, prop]) => {
        const rows = prop.tenants.map((t) => {
          const saved = data.bills ? data.bills[t.slug] : null;      // saved bill (history)
          const r = data.readings ? data.readings[t.slug] : null;    // live submission
          const submitted = r ? r.reading : null;
          const ai = r && r.aiReading != null ? r.aiReading : null;
          const isApproved = !!approved[t.slug];
          const ov = override[t.slug];
          const effective = ov !== undefined && ov !== "" ? Number(ov)
            : submitted != null ? submitted
            : saved ? saved.currentReading : null;
          const prevV = Number(prev[t.slug] || 0);
          const units = effective == null ? null : Math.max(0, effective - prevV);
          const mismatch = ai != null && submitted != null && Number(ai) !== Number(submitted);
          return { t, saved, submitted, ai, effective, prevV, units, mismatch, isApproved, photoUrl: r?.photoUrl || saved?.photoUrl, hasReading: !!r };
        });

        // For proportional split, units count from saved bills OR approved rows
        const totalUnits = rows.reduce((s, r) => {
          if (r.saved) return s + (r.saved.units || 0);
          if (r.isApproved) return s + (r.units || 0);
          return s;
        }, 0);
        const billNum = Number(totalBill[pkey]) || 0;

        return (
          <div key={pkey} style={{ marginTop: 20 }}>
            <h2 style={{ fontSize: 17, display: "flex", alignItems: "center", gap: 8 }}>
              {prop.name}
              {prop.isTest && <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, color: "#8a4a24", background: "#f7ede4", border: "1px solid #a8613c", borderRadius: 6, padding: "2px 8px" }}>practice</span>}
            </h2>
            {prop.isTest && <p style={{ fontSize: 12, color: "#8a8375", margin: "0 0 4px" }}>Safe to experiment — this never affects real bills.</p>}
            {prop.mode === "proportional" && (
              <div style={{ margin: "8px 0" }}>
                <label style={lbl}>Actual total bill for {prop.name}</label>
                <input inputMode="decimal" value={totalBill[pkey] || ""} onChange={(e) => setTotalBill({ ...totalBill, [pkey]: e.target.value.replace(/[^0-9.]/g, "") })} style={inp} placeholder="₹" />
              </div>
            )}
            {rows.map(({ t, saved, submitted, ai, effective, prevV, units, mismatch, isApproved, photoUrl, hasReading }) => {
              // If a saved bill exists, we show it as history (read-only)
              if (saved) {
                return (
                  <div key={t.slug} style={{ ...card, borderColor: "#cfe0d4" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <strong>{t.name}</strong>
                      <span style={{ fontFamily: "Georgia, serif", fontSize: 20, color: "#3f6b4a" }}>{money(saved.amount)}</span>
                    </div>
                    <div style={{ display: "flex", gap: 8, marginTop: 8, fontSize: 13, color: "#8a8375" }}>
                      <span>prev {saved.previousReading}</span>→<span>curr {saved.currentReading}</span>
                      <span style={{ marginLeft: "auto", fontWeight: 700, color: "#3b5b6b" }}>{saved.units} units</span>
                    </div>
                    <div style={{ fontSize: 12, color: "#3f6b4a", marginTop: 6 }}>✓ Billed {saved.savedAt ? new Date(saved.savedAt).toLocaleDateString("en-IN") : ""}</div>
                    {photoUrl && (
                      <div style={{ marginTop: 8 }}>
                        <img src={photoUrl} alt="meter" style={{ width: "100%", maxHeight: 240, objectFit: "contain", borderRadius: 10, border: "1px solid #e4ddd0", background: "#faf7f0" }} />
                        <a href={photoUrl} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: "#3b5b6b" }}>Open full size →</a>
                      </div>
                    )}
                  </div>
                );
              }

              const amount = !isApproved || effective == null ? null
                : prop.mode === "rate" ? units * prop.rate
                : totalUnits === 0 ? 0 : (units / totalUnits) * billNum;
              const extra = prop.mode === "rate" ? prop.rate : billNum;

              return (
                <div key={t.slug} style={{ ...card, borderColor: mismatch && !isApproved ? "#a8613c" : "#e4ddd0" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <strong>{t.name}</strong>
                    {isApproved
                      ? <span style={{ fontFamily: "Georgia, serif", fontSize: 20, color: "#3f6b4a" }}>{money(amount)}</span>
                      : <span style={{ fontSize: 13, color: "#8a8375", fontWeight: 600 }}>{hasReading ? "awaiting your check" : "no submission"}</span>}
                  </div>

                  {!hasReading && <p style={{ fontSize: 13, color: "#8a8375", margin: "8px 0 0" }}>This tenant hasn't submitted for {label(period)} yet.</p>}

                  {hasReading && (
                    <>
                      <div style={{ display: "flex", gap: 10, margin: "10px 0" }}>
                        <div style={compareBox}><div style={lblSm}>AI read</div><div style={{ fontSize: 18, fontWeight: 700 }}>{ai ?? "—"}</div></div>
                        <div style={compareBox}><div style={lblSm}>Tenant typed</div><div style={{ fontSize: 18, fontWeight: 700 }}>{submitted ?? "—"}</div></div>
                      </div>
                      {mismatch && <div style={flagBox}>⚠ AI and tenant disagree — check the photo before approving.</div>}
                      {photoUrl && (
                        <div style={{ margin: "8px 0" }}>
                          <div style={{ ...lblSm, marginBottom: 4 }}>Meter photo</div>
                          <img src={photoUrl} alt="meter" style={{ width: "100%", maxHeight: 280, objectFit: "contain", borderRadius: 10, border: "1px solid #e4ddd0", background: "#faf7f0" }} />
                          <a href={photoUrl} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: "#3b5b6b" }}>Open full size →</a>
                        </div>
                      )}
                      <div style={{ display: "flex", gap: 8, alignItems: "flex-end", margin: "8px 0" }}>
                        <div style={{ flex: 1 }}>
                          <label style={lblSm}>Previous {prev[t.slug] ? "(auto)" : ""}</label>
                          <input inputMode="numeric" value={prev[t.slug] || ""} onChange={(e) => setPrev({ ...prev, [t.slug]: e.target.value.replace(/[^0-9.]/g, "") })} style={inpSm} placeholder="0" />
                        </div>
                        <div style={{ flex: 1 }}>
                          <label style={lblSm}>Final current</label>
                          <input inputMode="numeric" value={override[t.slug] !== undefined ? override[t.slug] : (submitted ?? "")} onChange={(e) => setOverride({ ...override, [t.slug]: e.target.value.replace(/[^0-9.]/g, "") })} disabled={isApproved} style={{ ...inpSm, background: isApproved ? "#eef3f5" : "#fff" }} />
                        </div>
                        <div style={{ textAlign: "center", minWidth: 46 }}>
                          <div style={{ fontWeight: 700, color: "#3b5b6b" }}>{units ?? "—"}</div>
                          <div style={{ fontSize: 10, color: "#8a8375" }}>units</div>
                        </div>
                      </div>
                      {!isApproved ? (
                        <button onClick={() => setApproved({ ...approved, [t.slug]: true })} style={{ ...btn, background: "#3b5b6b", marginTop: 4 }}>Approve this reading</button>
                      ) : (
                        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                          <button onClick={() => setApproved({ ...approved, [t.slug]: false })} style={{ ...btn, background: "#fff", color: "#3b5b6b", border: "1px solid #e4ddd0", width: "auto", padding: "14px 16px", marginTop: 0 }}>Edit</button>
                          <a href={`https://wa.me/?text=${encodeURIComponent(waText(prop.name, t.name, prevV, effective, units, amount, prop.mode, extra))}`} target="_blank" rel="noreferrer" style={{ ...btn, textDecoration: "none", textAlign: "center", flex: 1, background: "#3f6b4a", marginTop: 0 }}>Send bill on WhatsApp</a>
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}

      {/* Save approved bills for this month so they show up as history */}
      {data && (
        <div style={{ marginTop: 24 }}>
          <button
            onClick={async () => {
              setSaving(true); setSavedMsg("");
              const bills = [];
              Object.entries(data.properties).forEach(([pkey, prop]) => {
                const bn = Number(totalBill[pkey]) || 0;
                const approvedRows = prop.tenants.map((t) => {
                  const r = data.readings ? data.readings[t.slug] : null;
                  const ov = override[t.slug];
                  const eff = ov !== undefined && ov !== "" ? Number(ov) : (r ? r.reading : null);
                  const pv = Number(prev[t.slug] || 0);
                  const u = eff == null ? null : Math.max(0, eff - pv);
                  return { t, eff, pv, u, approved: !!approved[t.slug], photoUrl: r?.photoUrl };
                }).filter((x) => x.approved && x.eff != null);
                const totU = approvedRows.reduce((s, x) => s + (x.u || 0), 0);
                approvedRows.forEach((x) => {
                  const amt = prop.mode === "rate" ? x.u * prop.rate : (totU === 0 ? 0 : (x.u / totU) * bn);
                  bills.push({ slug: x.t.slug, propertyKey: pkey, previousReading: x.pv, currentReading: x.eff, units: x.u, amount: Math.round(amt), photoUrl: x.photoUrl });
                });
              });
              if (bills.length === 0) { setSavedMsg("Approve at least one reading first."); setSaving(false); return; }
              try {
                const res = await fetch("/api/readings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "save-bill", pw, period, bills }) });
                if (!res.ok) throw new Error();
                setSavedMsg(`Saved ${bills.length} bill(s) for ${label(period)}.`);
                await fetchPeriod(period, pw);
              } catch { setSavedMsg("Could not save. Try again."); }
              setSaving(false);
            }}
            style={{ ...btn, background: "#1f2421" }}
            disabled={saving}
          >
            {saving ? "Saving…" : `Save this month's bills to history`}
          </button>
          {savedMsg && <p style={{ fontSize: 13, color: "#3f6b4a", textAlign: "center", marginTop: 8 }}>{savedMsg}</p>}
          <p style={{ fontSize: 12, color: "#8a8375", textAlign: "center", marginTop: 6 }}>
            Saving locks in the approved bills for {label(period)} and auto-fills next month's previous readings.
          </p>
        </div>
      )}
    </div>
  );
}

const lbl = { display: "block", fontSize: 12, color: "#8a8375", fontWeight: 700, margin: "10px 0 4px", textTransform: "uppercase", letterSpacing: 0.5 };
const lblSm = { display: "block", fontSize: 10, color: "#8a8375", fontWeight: 700, marginBottom: 2, textTransform: "uppercase" };
const inp = { width: "100%", boxSizing: "border-box", border: "1px solid #e4ddd0", borderRadius: 8, padding: 12, fontSize: 16, background: "#faf7f0" };
const inpSm = { width: "100%", boxSizing: "border-box", border: "1px solid #e4ddd0", borderRadius: 8, padding: 8, fontSize: 15, background: "#faf7f0" };
const btn = { width: "100%", background: "#1f2421", color: "#fff", border: "none", borderRadius: 10, padding: 14, fontWeight: 700, cursor: "pointer", marginTop: 10 };
const stepBtn = { border: "none", background: "transparent", fontSize: 20, width: 30, height: 30, cursor: "pointer", color: "#3b5b6b", borderRadius: 6 };
const card = { background: "#fff", border: "1px solid #e4ddd0", borderRadius: 12, padding: 14, marginTop: 10 };
const compareBox = { flex: 1, textAlign: "center", background: "#faf7f0", border: "1px solid #e4ddd0", borderRadius: 10, padding: "8px 6px" };
const flagBox = { background: "#f7ede4", border: "1px solid #a8613c", color: "#8a4a24", borderRadius: 8, padding: "8px 10px", fontSize: 13, fontWeight: 600, margin: "4px 0" };
