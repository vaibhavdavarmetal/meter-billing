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
function slugify(s) {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export default function Admin() {
  const [pw, setPw] = useState("");
  const [authed, setAuthed] = useState(false);
  const [view, setView] = useState("billing"); // billing | manage
  const [period, setPeriod] = useState(thisPeriod());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const [prev, setPrev] = useState({});
  const [override, setOverride] = useState({});
  const [approved, setApproved] = useState({});
  const [totalBill, setTotalBill] = useState({});
  const [extras, setExtras] = useState({}); // slug -> {rent, misc, miscNote, paid}
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState("");

  // manage-view working copy of properties
  const [reg, setReg] = useState(null);
  const [regMsg, setRegMsg] = useState("");

  const fetchPeriod = useCallback(async (p, password) => {
    setLoading(true); setErr("");
    try {
      const res = await fetch(`/api/readings?period=${p}&pw=${encodeURIComponent(password)}`);
      if (res.status === 401) { setErr("Wrong password."); setLoading(false); return false; }
      if (!res.ok) throw new Error();
      const d = await res.json();
      setData(d);
      const seededPrev = {};
      Object.entries(d.autoPrevious || {}).forEach(([slug, v]) => { if (v != null) seededPrev[slug] = String(v); });
      setPrev(seededPrev);
      // seed extras (rent from registry default if no per-month value yet)
      const ex = {};
      Object.entries(d.properties).forEach(([pk, prop]) => {
        prop.tenants.forEach((t) => {
          const e = d.extras && d.extras[t.slug];
          ex[t.slug] = {
            rent: e && e.rent != null ? String(e.rent) : (t.rent ? String(t.rent) : ""),
            misc: e && e.misc != null ? String(e.misc) : "",
            miscNote: e ? (e.miscNote || "") : "",
            paid: e ? !!e.paid : false,
          };
        });
      });
      setExtras(ex);
      setOverride({}); setApproved({}); setSavedMsg("");
      setLoading(false);
      return true;
    } catch { setErr("Could not load."); setLoading(false); return false; }
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

  const loadRegistry = async () => {
    setRegMsg("");
    try {
      const res = await fetch(`/api/registry?pw=${encodeURIComponent(pw)}`);
      if (!res.ok) throw new Error();
      const d = await res.json();
      setReg(d.properties);
    } catch { setRegMsg("Could not load tenant list."); }
  };

  const openManage = async () => { setView("manage"); if (!reg) await loadRegistry(); };

  const setExtra = (slug, field, val) => {
    setExtras((prev) => ({ ...prev, [slug]: { ...prev[slug], [field]: val } }));
  };
  // persist one tenant's extras
  const persistExtra = async (slug) => {
    const e = extras[slug]; if (!e) return;
    try {
      await fetch("/api/readings", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "save-extras", pw, period, slug, extras: e }) });
    } catch {}
  };

  const waText = (propName, tName, parts, total) => {
    let s = `Bill — ${label(period)}\n${propName} · ${tName}\n\n`;
    parts.forEach((p) => { s += `${p.label}: ${money(p.amount)}\n`; });
    s += `\nTotal payable: ${money(total)}`;
    return s;
  };

  // ── LOGIN ──
  if (!authed) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
        <div style={{ width: "100%", maxWidth: 340, background: "#fff", border: "1px solid #e4ddd0", borderRadius: 16, padding: 24 }}>
          <div style={{ fontSize: 11, letterSpacing: 2, textTransform: "uppercase", color: "#a8613c", fontWeight: 700 }}>Electricity ledger</div>
          <h1 style={{ fontFamily: "Georgia, serif", fontSize: 24, margin: "4px 0 18px" }}>Admin sign in</h1>
          <label style={lbl}>Password</label>
          <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} onKeyDown={(e) => e.key === "Enter" && login()} style={inp} placeholder="Enter admin password" autoFocus />
          {err && <p style={{ color: "#c0392b", fontSize: 14 }}>{err}</p>}
          <button onClick={login} style={btn} disabled={loading}>{loading ? "Checking…" : "Sign in"}</button>
        </div>
      </div>
    );
  }

  // ── MANAGE VIEW ──
  const renderManage = () => {
    if (!reg) return <p style={{ color: "#8a8375" }}>{regMsg || "Loading tenants…"}</p>;
    const setProp = (pk, field, val) => setReg({ ...reg, [pk]: { ...reg[pk], [field]: val } });
    const setTen = (pk, i, field, val) => {
      const next = structuredClone(reg);
      next[pk].tenants[i][field] = val;
      setReg(next);
    };
    const addTen = (pk) => {
      const next = structuredClone(reg);
      const base = pk + "-" + (next[pk].tenants.length + 1);
      next[pk].tenants.push({ slug: base, name: "New Tenant", rent: 0 });
      setReg(next);
    };
    const removeTen = (pk, i) => {
      const next = structuredClone(reg);
      next[pk].tenants.splice(i, 1);
      setReg(next);
    };
    const save = async () => {
      setRegMsg("");
      // auto-fix empty slugs from names
      const fixed = structuredClone(reg);
      Object.values(fixed).forEach((p) => p.tenants.forEach((t) => { if (!t.slug) t.slug = slugify(t.name); t.rent = Number(t.rent) || 0; }));
      try {
        const res = await fetch("/api/registry", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pw, properties: fixed }) });
        const d = await res.json();
        if (!res.ok) { setRegMsg(d.error || "Could not save."); return; }
        setReg(fixed);
        setRegMsg("Saved. Changes are live.");
      } catch { setRegMsg("Could not save."); }
    };

    return (
      <div>
        <p style={{ fontSize: 13, color: "#8a8375" }}>Edit names, rent, and the per-unit rate. Changes go live after you save. Each tenant's link is <code>?t=</code> + their link id.</p>
        {Object.entries(reg).map(([pk, prop]) => (
          <div key={pk} style={{ marginTop: 18 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <input value={prop.name} onChange={(e) => setProp(pk, "name", e.target.value)} style={{ ...inp, fontWeight: 700, width: "auto", flex: 1 }} />
              {prop.mode === "rate" && (
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <span style={{ fontSize: 12, color: "#8a8375" }}>₹/unit</span>
                  <input inputMode="decimal" value={prop.rate ?? ""} onChange={(e) => setProp(pk, "rate", e.target.value.replace(/[^0-9.]/g, ""))} style={{ ...inpSm, width: 64 }} />
                </div>
              )}
            </div>
            {prop.mode === "proportional" && <div style={{ fontSize: 12, color: "#8a8375", marginBottom: 6 }}>Splits the actual total bill by usage (no fixed rate).</div>}
            {prop.tenants.map((t, i) => (
              <div key={i} style={{ ...card, padding: 12 }}>
                <div style={{ display: "flex", gap: 8, marginBottom: 6 }}>
                  <div style={{ flex: 1 }}>
                    <label style={lblSm}>Name</label>
                    <input value={t.name} onChange={(e) => setTen(pk, i, "name", e.target.value)} style={inpSm} />
                  </div>
                  <div style={{ width: 90 }}>
                    <label style={lblSm}>Rent ₹</label>
                    <input inputMode="numeric" value={t.rent ?? ""} onChange={(e) => setTen(pk, i, "rent", e.target.value.replace(/[^0-9.]/g, ""))} style={inpSm} />
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
                  <div style={{ flex: 1 }}>
                    <label style={lblSm}>Link id (slug)</label>
                    <input value={t.slug} onChange={(e) => setTen(pk, i, "slug", e.target.value.replace(/[^a-z0-9-]/g, ""))} style={{ ...inpSm, fontFamily: "monospace" }} />
                  </div>
                  {!prop.isTest && <button onClick={() => removeTen(pk, i)} style={{ ...btn, background: "#fff", color: "#c0392b", border: "1px solid #e4ddd0", width: "auto", padding: "10px 12px", marginTop: 0 }}>Remove</button>}
                </div>
              </div>
            ))}
            {!prop.isTest && <button onClick={() => addTen(pk)} style={{ ...btn, background: "#eef3f5", color: "#3b5b6b", marginTop: 8 }}>+ Add tenant to {prop.name}</button>}
          </div>
        ))}
        <button onClick={save} style={{ ...btn, background: "#1f2421", marginTop: 20 }}>Save changes</button>
        {regMsg && <p style={{ fontSize: 13, color: regMsg.startsWith("Saved") ? "#3f6b4a" : "#c0392b", textAlign: "center", marginTop: 8 }}>{regMsg}</p>}
      </div>
    );
  };

  // ── BILLING VIEW ──
  const renderBilling = () => (
    <>
      {loading && <p style={{ color: "#8a8375" }}>Loading {label(period)}…</p>}
      {data && Object.entries(data.properties).map(([pkey, prop]) => {
        const rows = prop.tenants.map((t) => {
          const saved = data.bills ? data.bills[t.slug] : null;
          const r = data.readings ? data.readings[t.slug] : null;
          const submitted = r ? r.reading : null;
          const ai = r && r.aiReading != null ? r.aiReading : null;
          const isApproved = !!approved[t.slug];
          const ov = override[t.slug];
          const effective = ov !== undefined && ov !== "" ? Number(ov) : submitted != null ? submitted : saved ? saved.currentReading : null;
          const prevV = Number(prev[t.slug] || 0);
          const units = effective == null ? null : Math.max(0, effective - prevV);
          const mismatch = ai != null && submitted != null && Number(ai) !== Number(submitted);
          return { t, saved, submitted, ai, effective, prevV, units, mismatch, isApproved, photoUrl: r?.photoUrl || saved?.photoUrl, hasReading: !!r };
        });
        const totalUnits = rows.reduce((s, r) => (r.saved ? s + (r.saved.units || 0) : r.isApproved ? s + (r.units || 0) : s), 0);
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
                <label style={lbl}>Actual total electricity bill for {prop.name}</label>
                <input inputMode="decimal" value={totalBill[pkey] || ""} onChange={(e) => setTotalBill({ ...totalBill, [pkey]: e.target.value.replace(/[^0-9.]/g, "") })} style={inp} placeholder="₹" />
              </div>
            )}
            {rows.map(({ t, saved, submitted, ai, effective, prevV, units, mismatch, isApproved, photoUrl, hasReading }) => {
              const ex = extras[t.slug] || { rent: "", misc: "", miscNote: "", paid: false };
              const rent = Number(ex.rent) || 0;
              const misc = Number(ex.misc) || 0;

              if (saved) {
                const elec = saved.electricity != null ? saved.electricity : saved.amount;
                const sRent = saved.rent || 0, sMisc = saved.misc || 0;
                const total = saved.amount;
                return (
                  <div key={t.slug} style={{ ...card, borderColor: "#cfe0d4" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <strong>{t.name}</strong>
                      <span style={{ fontFamily: "Georgia, serif", fontSize: 20, color: "#3f6b4a" }}>{money(total)}</span>
                    </div>
                    <div style={{ fontSize: 13, color: "#8a8375", marginTop: 6 }}>
                      Electricity {money(elec)} · Rent {money(sRent)} · Misc {money(sMisc)}
                    </div>
                    <div style={{ fontSize: 12, color: "#8a8375", marginTop: 4 }}>prev {saved.previousReading} → curr {saved.currentReading} ({saved.units} units)</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
                      <span style={{ fontSize: 12, color: "#3f6b4a" }}>✓ Billed {saved.savedAt ? new Date(saved.savedAt).toLocaleDateString("en-IN") : ""}</span>
                      <label style={{ marginLeft: "auto", fontSize: 13, display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                        <input type="checkbox" checked={ex.paid} onChange={(e) => { setExtra(t.slug, "paid", e.target.checked); persistExtra(t.slug); }} />
                        {ex.paid ? "Paid" : "Mark paid"}
                      </label>
                    </div>
                    {photoUrl && <div style={{ marginTop: 8 }}><img src={photoUrl} alt="meter" style={{ width: "100%", maxHeight: 240, objectFit: "contain", borderRadius: 10, border: "1px solid #e4ddd0", background: "#faf7f0" }} /></div>}
                  </div>
                );
              }

              const elec = !isApproved || effective == null ? null
                : prop.mode === "rate" ? units * prop.rate
                : totalUnits === 0 ? 0 : (units / totalUnits) * billNum;
              const total = elec == null ? null : elec + rent + misc;

              return (
                <div key={t.slug} style={{ ...card, borderColor: mismatch && !isApproved ? "#a8613c" : "#e4ddd0" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <strong>{t.name}</strong>
                    {isApproved ? <span style={{ fontFamily: "Georgia, serif", fontSize: 20, color: "#3f6b4a" }}>{money(total)}</span>
                      : <span style={{ fontSize: 13, color: "#8a8375", fontWeight: 600 }}>{hasReading ? "awaiting your check" : "no submission"}</span>}
                  </div>

                  {!hasReading && <p style={{ fontSize: 13, color: "#8a8375", margin: "8px 0 0" }}>No meter reading submitted for {label(period)} yet. You can still bill rent + misc below.</p>}

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
                    </>
                  )}

                  {/* Rent + misc — always available */}
                  <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                    <div style={{ flex: 1 }}>
                      <label style={lblSm}>Rent ₹</label>
                      <input inputMode="numeric" value={ex.rent} onChange={(e) => setExtra(t.slug, "rent", e.target.value.replace(/[^0-9.]/g, ""))} onBlur={() => persistExtra(t.slug)} style={inpSm} placeholder="0" />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={lblSm}>Misc ₹</label>
                      <input inputMode="numeric" value={ex.misc} onChange={(e) => setExtra(t.slug, "misc", e.target.value.replace(/[^0-9.]/g, ""))} onBlur={() => persistExtra(t.slug)} style={inpSm} placeholder="0" />
                    </div>
                  </div>
                  <input value={ex.miscNote} onChange={(e) => setExtra(t.slug, "miscNote", e.target.value)} onBlur={() => persistExtra(t.slug)} style={{ ...inpSm, marginTop: 6 }} placeholder="Misc note (e.g. water, repair)" />

                  {isApproved || !hasReading ? (
                    <div style={{ marginTop: 10 }}>
                      {(isApproved || rent > 0 || misc > 0) && (
                        <>
                          <div style={{ fontSize: 13, color: "#8a8375", marginBottom: 8 }}>
                            {elec != null && <>Electricity {money(elec)} · </>}Rent {money(rent)} · Misc {money(misc)} → <strong style={{ color: "#1f2421" }}>{money((elec || 0) + rent + misc)}</strong>
                          </div>
                          <div style={{ display: "flex", gap: 8 }}>
                            {hasReading && <button onClick={() => setApproved({ ...approved, [t.slug]: false })} style={{ ...btn, background: "#fff", color: "#3b5b6b", border: "1px solid #e4ddd0", width: "auto", padding: "14px 16px", marginTop: 0 }}>Edit</button>}
                            <a href={`https://wa.me/?text=${encodeURIComponent(waText(prop.name, t.name, [
                              ...(elec != null ? [{ label: `Electricity (${units} units)`, amount: elec }] : []),
                              { label: "Rent", amount: rent },
                              ...(misc > 0 ? [{ label: "Misc" + (ex.miscNote ? ` (${ex.miscNote})` : ""), amount: misc }] : []),
                            ], (elec || 0) + rent + misc))}`} target="_blank" rel="noreferrer" style={{ ...btn, textDecoration: "none", textAlign: "center", flex: 1, background: "#3f6b4a", marginTop: 0 }}>Send bill on WhatsApp</a>
                          </div>
                        </>
                      )}
                    </div>
                  ) : (
                    <button onClick={() => setApproved({ ...approved, [t.slug]: true })} style={{ ...btn, background: "#3b5b6b", marginTop: 10 }}>Approve reading</button>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}

      {data && (
        <div style={{ marginTop: 24 }}>
          <button onClick={async () => {
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
                const elec = prop.mode === "rate" ? x.u * prop.rate : (totU === 0 ? 0 : (x.u / totU) * bn);
                const ex = extras[x.t.slug] || {};
                const rent = Number(ex.rent) || 0, misc = Number(ex.misc) || 0;
                bills.push({ slug: x.t.slug, propertyKey: pkey, previousReading: x.pv, currentReading: x.eff, units: x.u, electricity: Math.round(elec), rent, misc, amount: Math.round(elec + rent + misc), photoUrl: x.photoUrl });
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
          }} style={{ ...btn, background: "#1f2421" }} disabled={saving}>
            {saving ? "Saving…" : "Save this month's bills to history"}
          </button>
          {savedMsg && <p style={{ fontSize: 13, color: "#3f6b4a", textAlign: "center", marginTop: 8 }}>{savedMsg}</p>}
        </div>
      )}
    </>
  );

  return (
    <div style={{ maxWidth: 560, margin: "0 auto", padding: "20px 16px 48px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <h1 style={{ fontFamily: "Georgia, serif", fontSize: 22, margin: 0 }}>{view === "billing" ? "Billing" : "Manage tenants"}</h1>
        {view === "billing" && (
          <div style={{ display: "flex", alignItems: "center", gap: 4, background: "#fff", border: "1px solid #e4ddd0", borderRadius: 10, padding: 4 }}>
            <button onClick={() => changeMonth(-1)} style={stepBtn} aria-label="Previous month">‹</button>
            <div style={{ fontSize: 14, fontWeight: 600, minWidth: 84, textAlign: "center" }}>{label(period)}</div>
            <button onClick={() => changeMonth(1)} style={stepBtn} aria-label="Next month">›</button>
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <button onClick={() => setView("billing")} style={{ ...tabBtn, ...(view === "billing" ? tabActive : {}) }}>Billing</button>
        <button onClick={openManage} style={{ ...tabBtn, ...(view === "manage" ? tabActive : {}) }}>Manage tenants</button>
      </div>

      {view === "billing" ? renderBilling() : renderManage()}
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
const tabBtn = { flex: 1, padding: "10px", borderRadius: 10, border: "1px solid #e4ddd0", background: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer", color: "#8a8375" };
const tabActive = { background: "#3b5b6b", color: "#fff", borderColor: "#3b5b6b" };
