"use client";
import { useState, useEffect, Suspense } from "react";

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
// Tenants pay for the PREVIOUS month's usage, so show last month.
function billingMonthLabel() {
  const d = new Date();
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

// ── theme tokens ─────────────────────────────────────────────
const DARK = {
  "--page": "#0a0a0a", "--card": "#111111", "--elev": "#161616", "--field": "#0d0d0d",
  "--line": "#262626", "--hair": "#1f1f1f",
  "--fg": "#ededed", "--sec": "#a1a1a1", "--muted": "#737373",
  "--accent": "#6aa8ff", "--accent-weak": "#0d1220", "--accent-line": "#3d5680",
  "--good": "#4cc38a", "--good-bg": "#0e1f16", "--good-line": "#1d4030",
  "--warn": "#e5a13a", "--warn-bg": "#211803", "--warn-line": "#433310", "--warn-fg": "#e0b072",
  "--primary-bg": "#ffffff", "--primary-fg": "#0a0a0a",
};
const LIGHT = {
  "--page": "#fafafa", "--card": "#ffffff", "--elev": "#f6f6f6", "--field": "#fafafa",
  "--line": "#eaeaea", "--hair": "#f2f2f2",
  "--fg": "#0a0a0a", "--sec": "#666666", "--muted": "#8f8f8f",
  "--accent": "#0068d6", "--accent-weak": "#f4f9ff", "--accent-line": "#d6e6fb",
  "--good": "#0f7b34", "--good-bg": "#edf7f0", "--good-line": "#c6e5cf",
  "--warn": "#b45309", "--warn-bg": "#fff8eb", "--warn-line": "#f5e0b3", "--warn-fg": "#92400e",
  "--primary-bg": "#0a0a0a", "--primary-fg": "#ffffff",
};
const MONO = "'Geist Mono', ui-monospace, SFMono-Regular, Menlo, monospace";

function UsageChart({ data }) {
  if (!data || data.length === 0) return null;
  const w = 300, h = 156, padL = 30, padB = 38, padT = 10, padR = 10;
  const units = data.map((d) => d.units);
  const max = Math.max(...units, 1);
  const iw = w - padL - padR, ih = h - padT - padB;
  const n = data.length;
  const slot = iw / n;
  const barW = Math.min(slot * 0.6, 34);
  const y = (u) => padT + ih - (u / max) * ih;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: "100%", height: "auto" }} role="img" aria-label="Your electricity units used per month">
      <line x1={padL} y1={padT + ih} x2={w - padR} y2={padT + ih} stroke="var(--line)" strokeWidth="1" />
      <text x={padL - 6} y={y(max)} fontSize="9" fill="var(--muted)" textAnchor="end" dominantBaseline="middle" fontFamily={MONO}>{Math.round(max)}</text>
      <text x={padL - 6} y={padT + ih} fontSize="9" fill="var(--muted)" textAnchor="end" dominantBaseline="middle" fontFamily={MONO}>0</text>
      {data.map((d, i) => {
        const cx = padL + slot * i + slot / 2;
        const bh = (d.units / max) * ih;
        return (
          <g key={i}>
            <rect x={cx - barW / 2} y={padT + ih - bh} width={barW} height={bh} rx="4" fill="var(--accent)" />
            <text x={cx} y={padT + ih - bh - 4} fontSize="8" fill="var(--sec)" textAnchor="middle" fontFamily={MONO}>{Math.round(d.units)}</text>
            <text x={cx} y={h - 4} fontSize="7" fill="var(--muted)" textAnchor="end" transform={`rotate(-35 ${cx} ${h - 4})`}>{d.label}</text>
          </g>
        );
      })}
    </svg>
  );
}

// ── small inline icons ───────────────────────────────────────
const IconMoon = () => (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"></path></svg>);
const IconSun = () => (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M19 5l-1.5 1.5M6.5 17.5 5 19"></path></svg>);
const IconHome = ({ stroke }) => (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 10.5 12 3l9 7.5"></path><path d="M5 9.5V21h14V9.5"></path><path d="M10 21v-6h4v6"></path></svg>);
const IconCamera = () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7h3l1.5-2h7L17 7h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1Z"></path><circle cx="12" cy="13" r="3.5"></circle></svg>);
const IconWhatsApp = () => (<svg width="17" height="17" viewBox="0 0 24 24" fill="#25d366"><path d="M12.04 2c-5.46 0-9.9 4.44-9.9 9.9 0 1.75.46 3.45 1.32 4.95L2 22l5.3-1.38a9.87 9.87 0 0 0 4.74 1.2h.01c5.46 0 9.9-4.44 9.9-9.9 0-2.64-1.03-5.13-2.9-7A9.82 9.82 0 0 0 12.04 2Zm0 18.03h-.01c-1.5 0-2.98-.4-4.27-1.17l-.3-.18-3.15.82.84-3.07-.2-.32a8.2 8.2 0 0 1-1.26-4.38c0-4.54 3.7-8.23 8.24-8.23a8.2 8.2 0 0 1 8.23 8.24c0 4.54-3.69 8.24-8.22 8.24Zm4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.13-.16.24-.64.8-.78.97-.15.16-.29.18-.53.06-.25-.13-1.05-.39-1.99-1.23-.74-.66-1.23-1.47-1.38-1.71-.14-.25-.01-.38.11-.5.11-.11.25-.29.37-.44.12-.14.16-.24.25-.41.08-.16.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.4-.41-.56-.42h-.47c-.16 0-.43.06-.65.31-.22.24-.85.83-.85 2.03s.87 2.35.99 2.51c.12.16 1.72 2.62 4.16 3.67.58.25 1.03.4 1.39.51.58.19 1.11.16 1.53.1.47-.07 1.47-.6 1.67-1.18.21-.58.21-1.07.15-1.18-.06-.11-.22-.17-.47-.29Z"></path></svg>);
const IconPhone = () => (<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M6.5 3h3l1.5 4.5-2 1.5a12 12 0 0 0 5.5 5.5l1.5-2 4.5 1.5v3a2 2 0 0 1-2 2A16 16 0 0 1 4.5 5a2 2 0 0 1 2-2Z"></path></svg>);

function TenantForm() {
  const [slug, setSlug] = useState(null);
  const [tenantName, setTenantName] = useState("");
  const [propertyName, setPropertyName] = useState("");
  const [photo, setPhoto] = useState(null);       // base64
  const [mediaType, setMediaType] = useState("image/jpeg");
  const [preview, setPreview] = useState(null);
  const [aiReading, setAiReading] = useState(null);
  const [confidence, setConfidence] = useState(null);
  const [reading, setReading] = useState("");     // final value tenant confirms
  const [stage, setStage] = useState("start");    // start | reading | confirm | done | locked
  const [err, setErr] = useState("");
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [lockedInfo, setLockedInfo] = useState(null); // {reading, submittedAt}
  const [history, setHistory] = useState([]);      // [{label, units}]
  const [lastUnits, setLastUnits] = useState(null); // most recent recorded units
  const [previousReading, setPreviousReading] = useState(null);
  const [awaitingStart, setAwaitingStart] = useState(false);
  const [startSubmitted, setStartSubmitted] = useState(false);
  const [settlingIn, setSettlingIn] = useState(false);
  const [dues, setDues] = useState(null);
  const [reminder, setReminder] = useState(null);
  const [contacts, setContacts] = useState([]);
  const [ownerWhatsapp, setOwnerWhatsapp] = useState(null);
  const [showChart, setShowChart] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [movingOut, setMovingOut] = useState(false);
  const [finalSubmitted, setFinalSubmitted] = useState(false);
  const [finalReading, setFinalReading] = useState(null);
  const [settlement, setSettlement] = useState(null);
  const [isTest, setIsTest] = useState(false); // practice property: bill auto-generates on submit
  const [theme, setTheme] = useState("dark"); // dark by default

  useEffect(() => {
    try { const t = window.localStorage.getItem("tenant-theme"); if (t) setTheme(t); } catch {}
  }, []);
  const toggleTheme = () => { const t = theme === "dark" ? "light" : "dark"; setTheme(t); try { window.localStorage.setItem("tenant-theme", t); } catch {} };
  const tv = theme === "dark" ? DARK : LIGHT;

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("t");
    if (t) {
      setSlug(t);
      // Provisional name from slug while we fetch the real one
      setTenantName(t.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()));
      fetch(`/api/tenant?t=${encodeURIComponent(t)}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (d && d.name) { setTenantName(d.name); setPropertyName(d.propertyName || ""); }
          if (d && d.isTest) setIsTest(true);
          if (d && d.history) setHistory(d.history);
          if (d && d.lastUnits != null) setLastUnits(d.lastUnits);
          if (d && d.previousReading != null) setPreviousReading(d.previousReading);
          if (d && d.awaitingStart) setAwaitingStart(true);
          if (d && d.startSubmitted) setStartSubmitted(true);
          if (d && d.settlingIn) setSettlingIn(true);
          if (d && d.dues) setDues(d.dues);
          if (d && d.reminder) setReminder(d.reminder);
          if (d && d.contacts) setContacts(d.contacts);
          if (d && d.ownerWhatsapp) setOwnerWhatsapp(d.ownerWhatsapp);
          if (d && d.movingOut) setMovingOut(true);
          if (d && d.finalSubmitted) setFinalSubmitted(true);
          if (d && d.finalReading != null) setFinalReading(d.finalReading);
          if (d && d.settlement) setSettlement(d.settlement);
          if (d && d.active === false) { setStage("inactive"); return; }
          if (d && d.submitted) { setLockedInfo({ reading: d.reading, submittedAt: d.submittedAt }); setStage("locked"); }
        })
        .catch(() => {})
        .finally(() => setLoaded(true));
    } else {
      setLoaded(true);
    }
  }, []);

  const onPhoto = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErr("");
    try {
      const dataUrl = await new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(r.result);
        r.onerror = () => rej(new Error("read failed"));
        r.readAsDataURL(file);
      });

      // Draw onto a canvas, scale down, and re-encode as compressed JPEG so uploads stay small.
      const compressed = await new Promise((res) => {
        const img = new Image();
        img.onload = () => {
          const maxDim = 1400; // plenty of detail to read a meter, keeps size small
          let { width, height } = img;
          if (width > maxDim || height > maxDim) {
            if (width >= height) { height = Math.round(height * maxDim / width); width = maxDim; }
            else { width = Math.round(width * maxDim / height); height = maxDim; }
          }
          const canvas = document.createElement("canvas");
          canvas.width = width; canvas.height = height;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, width, height);
          // 0.7 quality JPEG — clear for reading, typically well under 1MB
          res(canvas.toDataURL("image/jpeg", 0.7));
        };
        img.onerror = () => res(dataUrl); // fall back to original if anything fails
        img.src = dataUrl;
      });

      const base64 = String(compressed).split(",")[1];
      setPhoto(base64);
      setMediaType("image/jpeg");
      setPreview(compressed);
      setStage("confirm");
    } catch {
      setErr("Couldn't read that photo. Please try again.");
    }
  };

  const requestSubmit = () => {
    if (submitting) return;
    if (!reading) { setErr("Please enter the meter number."); return; }
    setErr("");
    setShowConfirm(true);
  };

  const doSubmit = async () => {
    setShowConfirm(false);
    setSubmitting(true);
    try {
      const isFinal = movingOut && !finalSubmitted;
      const res = await fetch("/api/readings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, reading, imageBase64: photo, mediaType, isStart: awaitingStart, isFinal }),
      });
      if (res.status === 409) {
        const d = await res.json().catch(() => ({}));
        setLockedInfo({ reading: d.reading, submittedAt: d.submittedAt });
        setStage("locked");
        return;
      }
      if (res.status === 403) { setStage("inactive"); return; }
      if (res.status === 413) { setErr("The photo is too large. Please retake it a bit further back, or try again."); return; }
      if (!res.ok) throw new Error();
      const okData = await res.json().catch(() => ({}));
      // Practice property: the server auto-generates the bill and returns it. Show it right
      // away in the upper card (same shape the tenant sees for any finalised bill).
      if (okData && okData.bill) {
        const b = okData.bill;
        setDues({
          amount: b.amount, paid: false, outstanding: b.amount, adjustment: 0,
          carryIn: b.carryIn || 0, electricity: b.electricity || 0,
          rent: b.rent || 0, misc: b.misc || 0, paidAmount: null, status: "pending",
        });
      }
      if (isFinal) { setFinalReading(reading); setFinalSubmitted(true); }
      setStage("done");
    } catch {
      setErr("Could not submit — please check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  // Shared page chrome (theme vars + global styles + header bar).
  const Shell = ({ children, bar = true }) => (
    <div style={{ ...tv, minHeight: "100vh", background: "var(--page)", color: "var(--fg)" }}>
      <style>{`
        .tenant-wrap ::placeholder { color: var(--muted); opacity: .7; }
        .tenant-wrap input:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 16%, transparent); }
        .tenant-wrap button:active { transform: translateY(1px); }
        .tenant-wrap a, .tenant-wrap button { -webkit-tap-highlight-color: transparent; }
        @keyframes shimmer { 0% { background-position: 100% 0 } 100% { background-position: -100% 0 } }
        @keyframes spin { to { transform: rotate(360deg) } }
        .thead-in { max-width: 460px; margin: 0 auto; display: flex; align-items: center; justify-content: space-between; gap: 12px; }
        .tpage { max-width: 460px; margin: 0 auto; padding: 16px 16px calc(24px + env(safe-area-inset-bottom)); }
        .tside { display: flex; flex-direction: column; gap: 12px; }
        @media (min-width: 820px) {
          .thead-in { max-width: 940px; }
          .tpage { max-width: 940px; display: grid; grid-template-columns: minmax(0, 1fr) 320px; gap: 20px; align-items: start; padding-top: 24px; }
          .tside { position: sticky; top: 88px; }
        }
      `}</style>
      <div className="tenant-wrap">
        {bar && (
          <div style={{ padding: "14px 16px", background: "var(--page)", borderBottom: "1px solid var(--line)" }}>
           <div className="thead-in">
            <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
              <div style={{ width: 32, height: 32, flexShrink: 0, borderRadius: 8, background: "var(--primary-bg)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <IconHome stroke="var(--primary-fg)" />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, letterSpacing: "-0.011em", color: "var(--fg)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{tenantName || "Your home"}</div>
                {propertyName && <div style={{ fontSize: 12, color: "var(--muted)" }}>{propertyName}</div>}
              </div>
            </div>
            <button onClick={toggleTheme} aria-label="Toggle light or dark theme" style={{ display: "flex", alignItems: "center", gap: 6, height: 28, padding: "0 10px", border: "1px solid var(--line)", borderRadius: 999, background: "var(--card)", color: "var(--sec)", fontSize: 12, fontWeight: 500, cursor: "pointer" }}>
              {theme === "dark" ? <><IconSun /> Light</> : <><IconMoon /> Dark</>}
            </button>
           </div>
          </div>
        )}
        {children}
      </div>
    </div>
  );

  const inr = (n) => `₹${Math.round(Math.abs(Number(n) || 0)).toLocaleString("en-IN")}`;

  // Owner-prepared final settlement, shown to the tenant.
  const SettlementCard = () => {
    if (!settlement) return null;
    const refund = settlement.net < 0;
    const rows = [];
    if (settlement.electricity) rows.push([`Electricity${settlement.units ? ` · ${settlement.units} units` : ""}`, inr(settlement.electricity), "var(--fg)"]);
    if (settlement.rentAdj) rows.push([settlement.rentAdj < 0 ? "Rent refund" : "Rent", (settlement.rentAdj < 0 ? "−" : "") + inr(settlement.rentAdj), settlement.rentAdj < 0 ? "var(--good)" : "var(--fg)"]);
    if (settlement.misc) rows.push(["Misc", inr(settlement.misc), "var(--fg)"]);
    if (settlement.deposit) {
      rows.push(["Deposit held", inr(settlement.deposit), "var(--fg)"]);
      if (settlement.deposit - settlement.depositRefund > 0) rows.push(["Deductions", "−" + inr(settlement.deposit - settlement.depositRefund), "var(--warn)"]);
      rows.push(["Deposit refund", inr(settlement.depositRefund), "var(--good)"]);
    }
    return (
      <div style={dashCard}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={cardLabel}>Final settlement</div>
          <span style={pill(refund ? "good" : "warn")}>{refund ? "Refund" : "To pay"}</span>
        </div>
        <div style={{ fontFamily: MONO, fontSize: 30, fontWeight: 500, letterSpacing: "-0.03em", lineHeight: 1, marginTop: 6, color: refund ? "var(--good)" : "var(--fg)" }}>{inr(settlement.net)}</div>
        <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 6 }}>{refund ? "Refundable to you" : "Payable by you"}{settlement.moveOut ? ` · move-out ${settlement.moveOut}` : ""}</div>
        {rows.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--hair)" }}>
            {rows.map((r, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 13 }}>
                <span style={{ color: "var(--sec)" }}>{r[0]}</span>
                <span style={{ fontFamily: MONO, color: r[2] }}>{r[1]}</span>
              </div>
            ))}
          </div>
        )}
        <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 10, lineHeight: 1.5 }}>Prepared by your owner. Reach out if anything needs correcting.</div>
      </div>
    );
  };

  // Move-out: final reading entry → awaiting settlement → settlement.
  const MoveOutCard = () => {
    if (settlement) return SettlementCard();
    if (finalSubmitted) {
      return (
        <div style={dashCard}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={cardLabel}>Final meter reading</div>
            <span style={pill("good")}>Submitted</span>
          </div>
          <div style={{ fontFamily: MONO, fontSize: 34, fontWeight: 500, letterSpacing: "-0.03em", lineHeight: 1, marginTop: 8 }}>{finalReading != null ? finalReading : "—"}</div>
          <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 8, lineHeight: 1.5 }}>Your final reading is sent. Your owner will prepare your final settlement and share it here.</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12, padding: "11px 13px", border: "1px solid var(--hair)", borderRadius: 8, background: "var(--field)" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--sec)" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="9"></circle><path d="M12 8v4l2.5 2"></path></svg>
            <span style={{ fontSize: 13, color: "var(--sec)" }}>Awaiting final settlement from owner</span>
          </div>
        </div>
      );
    }
    // Final reading entry (unlocked on move-out day)
    return (
      <>
        <div style={{ border: "1px solid var(--warn-line)", borderRadius: 12, background: "var(--warn-bg)", padding: "14px 16px", display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}><span style={pill("warn")}>Moving out</span><span style={{ fontSize: 13, fontWeight: 600, color: "var(--warn-fg)" }}>Final reading needed</span></div>
          <div style={{ fontSize: 13, color: "var(--warn-fg)", lineHeight: 1.55 }}>Submit your <strong>final</strong> meter reading on your last day. This closes your account and lets your owner prepare the settlement.</div>
        </div>
        <div style={dashCard}>
          <div style={cardLabel}>Final meter reading · move-out day</div>
          {previousReading != null && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", border: "1px solid var(--line)", borderRadius: 8, background: "var(--field)", margin: "12px 0" }}>
              <span style={{ fontSize: 13, color: "var(--sec)" }}>Previous reading</span>
              <span style={{ fontFamily: MONO, fontSize: 17, fontWeight: 500, letterSpacing: "-0.02em", color: "var(--fg)" }}>{previousReading}</span>
            </div>
          )}
          <label style={bigBtn}>
            <IconCamera /> {photo ? "Retake photo" : "Take a photo of your meter"}
            <input type="file" accept="image/*" capture="environment" onChange={onPhoto} style={{ display: "none" }} />
          </label>
          {preview && <img src={preview} alt="meter" style={{ width: "100%", borderRadius: 10, margin: "14px 0", border: "1px solid var(--line)" }} />}
          {stage === "confirm" && (
            <div>
              <p style={{ color: "var(--fg)", fontWeight: 500, fontSize: 14, marginTop: 16 }}>Please type the final number shown on your meter.</p>
              <label style={fieldLabel}>Final meter number</label>
              <input inputMode="numeric" value={reading} onChange={(e) => setReading(e.target.value.replace(/[^0-9.]/g, ""))} style={input} placeholder="e.g. 8720" />
              {err && <p style={{ color: "#e5484d", fontSize: 14 }}>{err}</p>}
              <button onClick={requestSubmit} disabled={submitting} style={{ ...submitBtn, opacity: submitting ? 0.85 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
                {submitting ? (<><span style={{ width: 18, height: 18, border: "2.5px solid color-mix(in srgb, var(--primary-fg) 40%, transparent)", borderTopColor: "var(--primary-fg)", borderRadius: "50%", display: "inline-block", animation: "spin 0.7s linear infinite" }} /> Submitting…</>) : "Submit final reading"}
              </button>
            </div>
          )}
          <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 12, lineHeight: 1.5 }}>Take this on your actual move-out day so the final bill is accurate.</div>
        </div>
      </>
    );
  };

  // Skeleton loading — real labels shown, only the data shimmers.
  if (!loaded) {
    const Sk = ({ w, h, mt }) => (
      <div style={{ width: w, height: h || 14, marginTop: mt || 0, borderRadius: 6, background: "linear-gradient(90deg, var(--elev) 25%, var(--hair) 37%, var(--elev) 63%)", backgroundSize: "400% 100%", animation: "shimmer 1.4s ease infinite" }} />
    );
    return (
      <Shell>
        <div style={{ maxWidth: 460, margin: "0 auto", padding: "16px" }}>
          <div style={dashCard}><div style={cardLabel}>Total due</div><Sk w={140} h={28} mt={12} /><Sk w={110} h={11} mt={10} /></div>
          <div style={dashCard}><div style={cardLabel}>Meter reading · {billingMonthLabel()}</div><Sk w={130} h={14} mt={12} /><Sk w="100%" h={48} mt={16} /></div>
          <div style={{ ...dashCard, marginBottom: 0 }}><div style={cardLabel}>Maintenance &amp; help</div>
            {[0, 1, 2].map((i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 14 }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: "var(--elev)" }} />
                <div style={{ flex: 1 }}><Sk w="55%" h={13} /><Sk w="35%" h={10} mt={6} /></div>
              </div>
            ))}
          </div>
        </div>
      </Shell>
    );
  }

  if (!slug) {
    return (
      <Shell bar={false}>
        <div style={{ maxWidth: 440, margin: "0 auto", padding: "32px 20px" }}>
          <div style={cardCentered}>
            <h1 style={h1}>Meter Readings</h1>
            <p style={{ color: "var(--sec)", lineHeight: 1.55 }}>
              Open your personal link to submit your reading. It looks like
              <br /><code style={{ fontFamily: MONO }}>?t=your-name</code> at the end of the address.
            </p>
          </div>
        </div>
      </Shell>
    );
  }

  if (stage === "inactive") {
    // A settled move-out gets a warm close rather than a bare "inactive" message.
    if (settlement) {
      return (
        <Shell>
          <div style={{ maxWidth: 440, margin: "0 auto", padding: "16px" }}>
            <div style={dashCard}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--good)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m5 13 5 5L19 7"></path></svg>
                <h1 style={{ ...h1, margin: 0 }}>Move-out complete</h1>
              </div>
              <p style={{ color: "var(--sec)", lineHeight: 1.55, marginTop: 10 }}>
                Your account is settled and this link is now closed. Thank you for staying{propertyName ? ` at ${propertyName}` : ""} — we wish you all the best.
              </p>
            </div>
            {SettlementCard()}
          </div>
        </Shell>
      );
    }
    return (
      <Shell>
        <div style={{ maxWidth: 440, margin: "0 auto", padding: "16px" }}>
          <div style={cardCentered}>
            <h1 style={h1}>Link no longer active</h1>
            <p style={{ color: "var(--sec)", lineHeight: 1.55 }}>
              This meter reading link is no longer active. If you think this is a mistake, please contact the owner.
            </p>
          </div>
        </div>
      </Shell>
    );
  }

  // ── Dashboard sub-cards ──
  const DuesCard = () => {
    if (!dues) {
      const carried = reminder ? (reminder.carried || 0) : 0;
      return (
        <div style={dashCard}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={cardLabel}>Account</div>
            <span style={pill("warn")}>Rent due</span>
          </div>
          <div style={{ fontFamily: MONO, fontSize: 22, color: "var(--fg)", marginTop: 8, letterSpacing: "-0.02em" }}>Rent for {billingMonthLabel()} is due</div>
          {carried !== 0 && (
            <div style={{ fontSize: 13, marginTop: 8, padding: "8px 10px", borderRadius: 8, background: carried < 0 ? "var(--accent-weak)" : "var(--warn-bg)", color: carried < 0 ? "var(--accent)" : "var(--warn)" }}>
              {carried < 0
                ? `You have ₹${Math.abs(carried).toLocaleString("en-IN")} credit from last month — it'll be adjusted in this bill.`
                : `₹${carried.toLocaleString("en-IN")} was carried from last month — it'll be added to this bill.`}
            </div>
          )}
          <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 10 }}>Submit your meter reading below to get your final bill from the owner.</div>
        </div>
      );
    }
    const s = dues.status;
    const isPaid = s === "paid";
    const headline = isPaid ? "All settled" : `₹${(dues.outstanding).toLocaleString("en-IN")}`;
    const adj = dues.adjustment || 0;
    return (
      <div style={dashCard}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={cardLabel}>{s === "pending" ? "Total due" : "Account"}</div>
          <span style={pill(isPaid ? "good" : "warn")}>{isPaid ? "Paid" : "Pending"}</span>
        </div>
        <div style={{ fontFamily: MONO, fontSize: 30, color: "var(--fg)", marginTop: 6, letterSpacing: "-0.03em" }}>{headline}</div>
        {dues.carryIn ? <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 6 }}>{dues.carryIn > 0 ? `Includes ₹${dues.carryIn.toLocaleString("en-IN")} carried from before` : `Includes ₹${Math.abs(dues.carryIn).toLocaleString("en-IN")} credit`}</div> : null}
        <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 8, lineHeight: 1.6 }}>
          <div>Bill for {billingMonthLabel()}</div>
          <div>
            {`Electricity ₹${(dues.electricity || 0).toLocaleString("en-IN")} + Rent ₹${(dues.rent || 0).toLocaleString("en-IN")}`}
            {dues.misc ? ` + Misc ₹${dues.misc.toLocaleString("en-IN")}` : ""}
            {dues.carryIn ? ` ${dues.carryIn > 0 ? "+" : "−"} ₹${Math.abs(dues.carryIn).toLocaleString("en-IN")}` : ""}
            {` = ₹${(dues.amount || 0).toLocaleString("en-IN")}`}
          </div>
          {dues.paidAmount != null && <div>Paid: ₹{dues.paidAmount.toLocaleString("en-IN")}</div>}
        </div>
        {adj !== 0 && (
          <div style={{ fontSize: 13, marginTop: 10, padding: "8px 10px", borderRadius: 8, background: adj < 0 ? "var(--accent-weak)" : "var(--warn-bg)", color: adj < 0 ? "var(--accent)" : "var(--warn)" }}>
            {adj < 0
              ? `You paid ₹${Math.abs(adj).toLocaleString("en-IN")} extra — this will be adjusted (credited) in your next bill.`
              : `You paid ₹${adj.toLocaleString("en-IN")} less — this will be added to your next bill.`}
          </div>
        )}
      </div>
    );
  };

  const ContactsCard = () => {
    if (!contacts || contacts.length === 0) return null;
    const groups = [];
    const byLabel = {};
    contacts.forEach((c) => {
      const key = (c.label || "Other").trim() || "Other";
      if (!byLabel[key]) { byLabel[key] = []; groups.push(key); }
      byLabel[key].push(c);
    });
    return (
      <div style={dashCard}>
        <div style={cardLabel}>Maintenance &amp; help</div>
        <div style={{ marginTop: 6 }}>
          {groups.map((label, gi) => (
            <div key={label} style={{ marginTop: gi ? 16 : 8 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--accent)", marginBottom: 2 }}>{label}</div>
              {byLabel[label].map((c, i) => (
                <a key={i} href={`tel:${c.phone}`} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderTop: i ? "1px solid var(--hair)" : "none", textDecoration: "none", color: "var(--fg)" }}>
                  <span style={{ width: 32, height: 32, borderRadius: 8, background: "var(--elev)", border: "1px solid var(--line)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--sec)" }}><IconPhone /></span>
                  <span style={{ flex: 1, textAlign: "left" }}>
                    <span style={{ display: "block", fontWeight: 500, fontSize: 14 }}>{c.name}</span>
                  </span>
                  <span style={{ display: "inline-flex", alignItems: "center", height: 32, padding: "0 12px", border: "1px solid var(--line)", borderRadius: 6, color: "var(--fg)", fontWeight: 500, fontSize: 13 }}>Call</span>
                </a>
              ))}
            </div>
          ))}
        </div>
      </div>
    );
  };

  const MeterCard = () => {
    // Baseline submitted, awaiting owner verification
    if (startSubmitted && stage !== "done") {
      return (
        <div style={dashCard}>
          <div style={cardLabel}>Starting meter reading</div>
          <div style={{ fontFamily: MONO, fontSize: 20, color: "var(--fg)", marginTop: 10 }}>Submitted — awaiting owner confirmation</div>
          <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 6, lineHeight: 1.5 }}>Thanks! Your starting meter reading has been sent to the owner to verify. Once confirmed, you'll submit your monthly readings here.</div>
        </div>
      );
    }
    // Settling-in: baseline confirmed, still in move-in month.
    if (settlingIn) {
      return (
        <div style={dashCard}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={cardLabel}>Starting meter reading</div>
            <span style={pill("good")}>Submitted</span>
          </div>
          <div style={{ fontFamily: MONO, fontSize: 26, color: "var(--fg)", marginTop: 8, letterSpacing: "-0.02em" }}>{previousReading != null ? previousReading : "—"}</div>
          <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 2, lineHeight: 1.5 }}>Your starting reading is confirmed. Your first monthly reading will open here on the 1st.</div>
        </div>
      );
    }
    // Submitted / locked state
    if (stage === "locked" || stage === "done") {
      return (
        <div style={dashCard}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={cardLabel}>{awaitingStart ? "Starting meter reading" : `Meter reading · ${billingMonthLabel()}`}</div>
            <span style={pill("good")}>{isTest && !awaitingStart ? "Bill generated" : "Submitted"}</span>
          </div>
          <div style={{ fontFamily: MONO, fontSize: 34, color: "var(--fg)", marginTop: 8, letterSpacing: "-0.03em", lineHeight: 1 }}>
            {stage === "done" ? reading : (lockedInfo && lockedInfo.reading != null ? lockedInfo.reading : "—")}
          </div>
          <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 8 }}>{awaitingStart ? "Your starting reading is saved. From next month you'll submit monthly readings here." : isTest ? "Your bill was generated from this reading — see the amount above. The owner will verify your meter photo." : "Your submitted reading. Contact the owner if it needs changing."}</div>
          {stage === "done" && ownerWhatsapp && (
            <a
              href={`https://wa.me/${ownerWhatsapp}?text=${encodeURIComponent(`Hi, I've submitted my meter reading (${reading}) for ${billingMonthLabel()}${propertyName ? ` at ${propertyName}` : ""}${tenantName ? ` — ${tenantName}` : ""}. Please verify. Thank you.`)}`}
              target="_blank" rel="noopener noreferrer"
              style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 14, padding: "12px", borderRadius: 8, background: "var(--card)", border: "1px solid var(--line)", color: "var(--fg)", fontWeight: 500, fontSize: 14, textDecoration: "none" }}
            >
              <IconWhatsApp /> Notify owner on WhatsApp
            </a>
          )}
          {history.length > 0 && (
            <div style={{ marginTop: 14, borderTop: "1px solid var(--hair)", paddingTop: 12 }}>
              <button onClick={() => setShowChart((v) => !v)} style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", background: "transparent", border: "none", cursor: "pointer", padding: 0, color: "var(--accent)", fontWeight: 500, fontSize: 14 }}>
                View detailed units info
                <span style={{ display: "inline-flex", transform: showChart ? "rotate(180deg)" : "none", transition: "transform .15s", color: "var(--accent)" }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"></path></svg>
                </span>
              </button>
              {showChart && (
                <div style={{ marginTop: 12 }}>
                  <UsageChart data={history} />
                  <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 6 }}>Units used each billing cycle (this cycle appears once your bill is finalised).</p>
                </div>
              )}
            </div>
          )}
        </div>
      );
    }
    // Unlocked / entry state
    return (
      <div style={dashCard}>
        <div style={cardLabel}>{awaitingStart ? "Welcome — starting meter reading" : `Meter reading · ${billingMonthLabel()}`}</div>
        {awaitingStart ? (
          <div style={{ fontSize: 14, color: "var(--fg)", margin: "8px 0 14px", lineHeight: 1.5 }}>
            Welcome to your new home! To get started, please take a photo of your electricity meter <strong>today (your move-in day)</strong> and submit the reading. This becomes your starting point — you'll only be billed for what you use from here on.
          </div>
        ) : previousReading != null && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", border: "1px solid var(--line)", borderRadius: 8, background: "var(--field)", margin: "12px 0" }}>
            <span style={{ fontSize: 13, color: "var(--sec)" }}>Previous reading</span>
            <span style={{ fontFamily: MONO, fontSize: 17, fontWeight: 500, letterSpacing: "-0.02em", color: "var(--fg)" }}>{previousReading}</span>
          </div>
        )}

        <label style={bigBtn}>
          <IconCamera /> {photo ? "Retake photo" : "Take a photo of your meter"}
          <input type="file" accept="image/*" capture="environment" onChange={onPhoto} style={{ display: "none" }} />
        </label>

        {preview && <img src={preview} alt="meter" style={{ width: "100%", borderRadius: 10, margin: "14px 0", border: "1px solid var(--line)" }} />}

        {stage === "confirm" && (
          <div>
            <p style={{ color: "var(--fg)", fontWeight: 500, fontSize: 14, marginTop: 16 }}>Please type the number shown on your meter.</p>
            <label style={fieldLabel}>Meter number</label>
            <input inputMode="numeric" value={reading} onChange={(e) => setReading(e.target.value.replace(/[^0-9.]/g, ""))} style={input} placeholder="e.g. 4521" />
            {err && <p style={{ color: "#e5484d", fontSize: 14 }}>{err}</p>}
            <button onClick={requestSubmit} disabled={submitting} style={{ ...submitBtn, opacity: submitting ? 0.85 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
              {submitting ? (<><span style={{ width: 18, height: 18, border: "2.5px solid color-mix(in srgb, var(--primary-fg) 40%, transparent)", borderTopColor: "var(--primary-fg)", borderRadius: "50%", display: "inline-block", animation: "spin 0.7s linear infinite" }} /> {isTest && !awaitingStart && !movingOut ? "Generating…" : "Submitting…"}</>) : (isTest && !awaitingStart && !movingOut ? "Generate bill" : "Submit reading")}
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <Shell>
      <div className="tpage">
        <div>
          {movingOut ? (
            <>{MoveOutCard()}</>
          ) : settlingIn ? (
            <>{MeterCard()}</>
          ) : (
            <>
              {!(awaitingStart || startSubmitted) && DuesCard()}
              {MeterCard()}
            </>
          )}
        </div>
        <aside className="tside">
          {contacts && contacts.length > 0 ? ContactsCard() : (
            <div style={dashCard}>
              <div style={cardLabel}>Maintenance &amp; help</div>
              <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 10, lineHeight: 1.5 }}>
                No maintenance contacts have been added yet.{ownerWhatsapp ? " Reach the owner on WhatsApp if you need help." : " Contact the owner if you need help."}
              </div>
            </div>
          )}
        </aside>
      </div>

      {showConfirm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 50 }} onClick={() => setShowConfirm(false)}>
          <div style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 14, padding: 22, maxWidth: 340, width: "100%", textAlign: "left", color: "var(--fg)" }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: "0 0 10px", fontSize: 17, fontWeight: 600, letterSpacing: "-0.014em" }}>{awaitingStart ? `Submit starting reading of ${reading}?` : movingOut ? `Submit final reading of ${reading}?` : (isTest ? `Generate bill for reading ${reading}?` : `Submit reading of ${reading}?`)}</h3>
            <p style={{ fontSize: 14, color: "var(--sec)", margin: "0 0 18px", lineHeight: 1.5 }}>
              {awaitingStart
                ? <>This will be saved as your <strong>starting meter reading</strong>. Please make sure it matches your meter today.</>
                : movingOut
                ? <>This is your <strong>final reading</strong> for move-out. Your owner will prepare the settlement from it. Please make sure it matches your meter today.</>
                : isTest
                ? <>Your <strong>bill will be generated instantly</strong> from this reading and shown above. The owner still verifies your meter photo. Please make sure your reading is correct.</>
                : <>Once submitted, you <strong>cannot submit again</strong> for {billingMonthLabel()} unless the owner unlocks it. Please make sure your reading is correct.</>}
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setShowConfirm(false)} style={{ ...submitBtn, background: "var(--card)", color: "var(--fg)", border: "1px solid var(--line)", marginTop: 0 }}>Cancel</button>
              <button onClick={doSubmit} style={{ ...submitBtn, marginTop: 0 }}>{isTest && !awaitingStart && !movingOut ? "Generate bill" : "Submit"}</button>
            </div>
          </div>
        </div>
      )}
    </Shell>
  );
}

export default function Page() {
  return <Suspense><TenantForm /></Suspense>;
}

// ── inline styles (CSS-variable driven) ──────────────────────
const dashCard = { background: "var(--card)", border: "1px solid var(--line)", borderRadius: 12, padding: 16, marginBottom: 12, textAlign: "left" };
const cardCentered = { background: "var(--card)", border: "1px solid var(--line)", borderRadius: 12, padding: 24, textAlign: "center" };
const cardLabel = { fontSize: 12, color: "var(--sec)", fontWeight: 500 };
const h1 = { fontSize: 20, margin: "0 0 8px", color: "var(--fg)", fontWeight: 600, letterSpacing: "-0.018em" };
const bigBtn = { display: "flex", alignItems: "center", justifyContent: "center", gap: 8, textAlign: "center", background: "var(--primary-bg)", color: "var(--primary-fg)", padding: "14px", borderRadius: 8, fontWeight: 500, cursor: "pointer", fontSize: 15 };
const fieldLabel = { display: "block", fontSize: 12, color: "var(--sec)", fontWeight: 500, margin: "16px 0 6px" };
const input = { width: "100%", boxSizing: "border-box", border: "1px solid var(--line)", borderRadius: 8, padding: "14px", fontSize: 22, fontWeight: 500, background: "var(--field)", textAlign: "center", color: "var(--fg)", fontFamily: MONO, letterSpacing: "0.02em" };
const submitBtn = { width: "100%", marginTop: 16, background: "var(--primary-bg)", color: "var(--primary-fg)", border: "none", borderRadius: 8, padding: "14px", fontSize: 15, fontWeight: 500, cursor: "pointer" };
const pill = (kind) => ({ display: "inline-flex", alignItems: "center", gap: 6, height: 22, padding: "0 9px", borderRadius: 999, fontSize: 11, fontWeight: 500, background: `var(--${kind}-bg)`, border: `1px solid var(--${kind}-line)`, color: `var(--${kind})` });
