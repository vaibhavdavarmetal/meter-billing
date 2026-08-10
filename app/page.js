"use client";
import { useState, useEffect, Suspense } from "react";

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
// Tenants pay for the PREVIOUS month's usage, so show last month.
function billingMonthLabel() {
  const d = new Date();
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

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
      <line x1={padL} y1={padT + ih} x2={w - padR} y2={padT + ih} stroke="#e7e0d4" strokeWidth="1" />
      <text x={padL - 6} y={y(max)} fontSize="9" fill="#8a857a" textAnchor="end" dominantBaseline="middle">{Math.round(max)}</text>
      <text x={padL - 6} y={padT + ih} fontSize="9" fill="#8a857a" textAnchor="end" dominantBaseline="middle">0</text>
      {data.map((d, i) => {
        const cx = padL + slot * i + slot / 2;
        const bh = (d.units / max) * ih;
        return (
          <g key={i}>
            <rect x={cx - barW / 2} y={padT + ih - bh} width={barW} height={bh} rx="3" fill="#3b6478" />
            <text x={cx} y={padT + ih - bh - 4} fontSize="8" fill="#5a6b74" textAnchor="middle">{Math.round(d.units)}</text>
            <text x={cx} y={h - 4} fontSize="7" fill="#8a857a" textAnchor="end" transform={`rotate(-35 ${cx} ${h - 4})`}>{d.label}</text>
          </g>
        );
      })}
    </svg>
  );
}

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
  const [dues, setDues] = useState(null);
  const [contacts, setContacts] = useState([]);
  const [showChart, setShowChart] = useState(false);
  const [loaded, setLoaded] = useState(false);

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
          if (d && d.history) setHistory(d.history);
          if (d && d.lastUnits != null) setLastUnits(d.lastUnits);
          if (d && d.previousReading != null) setPreviousReading(d.previousReading);
          if (d && d.dues) setDues(d.dues);
          if (d && d.contacts) setContacts(d.contacts);
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
      const res = await fetch("/api/readings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, reading, imageBase64: photo, mediaType }),
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
      setStage("done");
    } catch {
      setErr("Could not submit — please check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  // Skeleton loading — real labels shown, only the data shimmers (feels oriented, no empty flash)
  if (!loaded) {
    const Sk = ({ w, h, mt }) => (
      <div style={{ width: w, height: h || 14, marginTop: mt || 0, borderRadius: 6, background: "linear-gradient(90deg,#eee7db 25%,#f3eee4 37%,#eee7db 63%)", backgroundSize: "400% 100%", animation: "shimmer 1.4s ease infinite" }} />
    );
    return (
      <div style={{ maxWidth: 460, margin: "0 auto", padding: "24px 16px calc(90px + env(safe-area-inset-bottom))", minHeight: "100vh", background: "#f6f2ea" }}>
        <style>{`@keyframes shimmer{0%{background-position:100% 0}100%{background-position:-100% 0}}`}</style>
        <div style={{ textAlign: "center", marginBottom: 16, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
          <div style={eyebrow}>Your home</div>
          <h1 style={{ ...h1, margin: "2px 0 0" }}>{tenantName || <Sk w={160} h={22} />}</h1>
          <Sk w={90} h={12} />
        </div>
        {/* dues */}
        <div style={{ background: "#fff", border: "1px solid #e7e0d4", borderRadius: 18, padding: 20, marginBottom: 14 }}>
          <div style={cardLabel}>Account</div>
          <Sk w={140} h={28} mt={12} />
          <Sk w={110} h={11} mt={10} />
        </div>
        {/* meter */}
        <div style={{ background: "#fff", border: "1px solid #e7e0d4", borderRadius: 18, padding: 20, marginBottom: 14 }}>
          <div style={cardLabel}>Meter reading · {billingMonthLabel()}</div>
          <Sk w={130} h={14} mt={12} />
          <Sk w="100%" h={52} mt={16} />
        </div>
        {/* contacts */}
        <div style={{ background: "#fff", border: "1px solid #e7e0d4", borderRadius: 18, padding: 20 }}>
          <div style={cardLabel}>Maintenance & help</div>
          {[0, 1, 2].map((i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 14 }}>
              <div style={{ width: 38, height: 38, borderRadius: "50%", background: "#eee7db" }} />
              <div style={{ flex: 1 }}><Sk w="55%" h={13} /><Sk w="35%" h={10} mt={6} /></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!slug) {
    return (
      <Card>
        <h1 style={h1}>Meter Readings</h1>
        <p style={{ color: "#8a8375" }}>
          Open your personal link to submit your reading. It looks like
          <br /><code>?t=your-name</code> at the end of the address.
        </p>
      </Card>
    );
  }

  if (stage === "inactive") {
    return (
      <Card>
        <h1 style={h1}>Link no longer active</h1>
        <p style={{ color: "#8a8375" }}>
          This meter reading link is no longer active. If you think this is a mistake, please contact the owner.
        </p>
      </Card>
    );
  }

  // ── Dashboard sub-cards ──
  const DuesCard = () => {
    if (!dues) {
      return (
        <DashCard>
          <div style={cardLabel}>Account</div>
          <div style={{ fontSize: 15, color: "#8a857a", marginTop: 4 }}>No dues right now. Your bill for {billingMonthLabel()} will appear here once it's finalised.</div>
        </DashCard>
      );
    }
    const s = dues.status;
    const pill = s === "paid" ? { bg: "#e6f0ea", fg: "#3f7a52", t: "Paid" }
      : s === "overpaid" ? { bg: "#eef3f5", fg: "#3b6478", t: "In credit" }
      : { bg: "#f7ede4", fg: "#b06a3c", t: "Pending" };
    const headline = s === "overpaid" ? `₹${Math.abs(dues.outstanding).toLocaleString("en-IN")} credit`
      : s === "paid" ? "All settled"
      : `₹${(dues.outstanding).toLocaleString("en-IN")}`;
    return (
      <DashCard>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={cardLabel}>{s === "pending" ? "Total due" : "Account"}</div>
          <span style={{ background: pill.bg, color: pill.fg, fontSize: 12, fontWeight: 700, borderRadius: 20, padding: "4px 12px" }}>{pill.t}</span>
        </div>
        <div style={{ fontFamily: "Georgia, serif", fontSize: 30, color: "#232826", marginTop: 6 }}>{headline}</div>
        {dues.carryIn ? <div style={{ fontSize: 12, color: "#8a857a", marginTop: 4 }}>{dues.carryIn > 0 ? `Includes ₹${dues.carryIn.toLocaleString("en-IN")} carried from before` : `Includes ₹${Math.abs(dues.carryIn).toLocaleString("en-IN")} credit`}</div> : null}
        <div style={{ fontSize: 12, color: "#8a857a", marginTop: 4 }}>Bill for {billingMonthLabel()}</div>
      </DashCard>
    );
  };

  const ContactsCard = () => {
    if (!contacts || contacts.length === 0) return null;
    return (
      <DashCard>
        <div style={cardLabel}>Maintenance & help</div>
        <div style={{ marginTop: 8 }}>
          {contacts.map((c, i) => (
            <a key={i} href={`tel:${c.phone}`} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 0", borderTop: i ? "1px solid #f0ebe1" : "none", textDecoration: "none", color: "#232826" }}>
              <span style={{ width: 38, height: 38, borderRadius: "50%", background: "#eef3f5", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17 }}>📞</span>
              <span style={{ flex: 1, textAlign: "left" }}>
                <span style={{ display: "block", fontWeight: 600, fontSize: 15 }}>{c.name}</span>
                <span style={{ display: "block", fontSize: 12, color: "#8a857a" }}>{c.label || "Contact"}</span>
              </span>
              <span style={{ color: "#3b6478", fontWeight: 600, fontSize: 14 }}>Call</span>
            </a>
          ))}
        </div>
      </DashCard>
    );
  };

  const MeterCard = () => {
    // Submitted / locked state
    if (stage === "locked" || stage === "done") {
      return (
        <DashCard>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={cardLabel}>Meter reading · {billingMonthLabel()}</div>
            <span style={{ background: "#e6f0ea", color: "#3f7a52", fontSize: 12, fontWeight: 700, borderRadius: 20, padding: "4px 12px" }}>✓ Submitted</span>
          </div>
          <div style={{ fontFamily: "Georgia, serif", fontSize: 26, color: "#232826", marginTop: 8 }}>
            {stage === "done" ? reading : (lockedInfo && lockedInfo.reading != null ? lockedInfo.reading : "—")}
          </div>
          <div style={{ fontSize: 13, color: "#8a857a", marginTop: 2 }}>Your submitted reading. Contact the owner if it needs changing.</div>
          {history.length > 0 && (
            <div style={{ marginTop: 14, borderTop: "1px solid #f0ebe1", paddingTop: 12 }}>
              <button onClick={() => setShowChart((v) => !v)} style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", background: "transparent", border: "none", cursor: "pointer", padding: 0, color: "#3b6478", fontWeight: 600, fontSize: 14 }}>
                View detailed units info
                <span style={{ transform: showChart ? "rotate(180deg)" : "none", transition: "transform .15s" }}>▾</span>
              </button>
              {showChart && (
                <div style={{ marginTop: 12 }}>
                  <UsageChart data={history} />
                  <p style={{ fontSize: 12, color: "#8a857a", marginTop: 6 }}>Units used each billing cycle (this cycle appears once your bill is finalised).</p>
                </div>
              )}
            </div>
          )}
        </DashCard>
      );
    }
    // Unlocked / entry state
    return (
      <DashCard>
        <div style={cardLabel}>Meter reading · {billingMonthLabel()}</div>
        {previousReading != null && (
          <div style={{ fontSize: 14, color: "#232826", margin: "8px 0 14px" }}>
            Previous reading: <strong style={{ color: "#3b6478" }}>{previousReading}</strong>
          </div>
        )}

        <label style={bigBtn}>
          📷 {photo ? "Retake photo" : "Take a photo of your meter"}
          <input type="file" accept="image/*" capture="environment" onChange={onPhoto} style={{ display: "none" }} />
        </label>

        {preview && <img src={preview} alt="meter" style={{ width: "100%", borderRadius: 12, margin: "14px 0", border: "1px solid #e4ddd0" }} />}

        {stage === "confirm" && (
          <div>
            <p style={{ color: "#3b5b6b", fontWeight: 600 }}>Please type the number shown on your meter.</p>
            <label style={fieldLabel}>Meter number</label>
            <input inputMode="numeric" value={reading} onChange={(e) => setReading(e.target.value.replace(/[^0-9.]/g, ""))} style={input} placeholder="e.g. 4521" />
            {err && <p style={{ color: "#c0392b", fontSize: 14 }}>{err}</p>}
            <button onClick={requestSubmit} disabled={submitting} style={{ ...submitBtn, opacity: submitting ? 0.85 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
              {submitting ? (<><span style={{ width: 18, height: 18, border: "2.5px solid rgba(255,255,255,0.4)", borderTopColor: "#fff", borderRadius: "50%", display: "inline-block", animation: "spin 0.7s linear infinite" }} /> Submitting…</>) : "Submit reading"}
            </button>
            <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
          </div>
        )}
      </DashCard>
    );
  };

  return (
    <div style={{ maxWidth: 460, margin: "0 auto", padding: "24px 16px calc(90px + env(safe-area-inset-bottom))", background: "#f6f2ea" }}>
      <div style={{ textAlign: "center", marginBottom: 4 }}>
        <div style={eyebrow}>Your home</div>
        <h1 style={{ ...h1, margin: "4px 0 2px" }}>{tenantName}</h1>
        {propertyName && <div style={{ fontSize: 13, color: "#8a857a", marginBottom: 16 }}>{propertyName}</div>}
      </div>

      <DuesCard />
      <MeterCard />
      <ContactsCard />

      {showConfirm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(31,36,33,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 50 }} onClick={() => setShowConfirm(false)}>
          <div style={{ background: "#fff", borderRadius: 16, padding: 22, maxWidth: 340, width: "100%", textAlign: "left" }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: "0 0 10px", fontFamily: "Georgia, serif" }}>Submit reading of {reading}?</h3>
            <p style={{ fontSize: 14, color: "#8a8375", margin: "0 0 18px", lineHeight: 1.5 }}>
              Once submitted, you <strong>cannot submit again</strong> for {billingMonthLabel()} unless the owner unlocks it. Please make sure your reading is correct.
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setShowConfirm(false)} style={{ ...submitBtn, background: "#fff", color: "#3b5b6b", border: "1px solid #e4ddd0", marginTop: 0 }}>Cancel</button>
              <button onClick={doSubmit} style={{ ...submitBtn, marginTop: 0 }}>Submit</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Page() {
  return <Suspense><TenantForm /></Suspense>;
}

// ── inline styles ─────────────────────────────────────────────
const Card = ({ children }) => (
  <div style={{ maxWidth: 440, margin: "0 auto", padding: "32px 20px", minHeight: "100vh", background: "#f6f2ea" }}>
    <div style={{ background: "#fff", border: "1px solid #e7e0d4", borderRadius: 20, padding: 26, textAlign: "center", boxShadow: "0 4px 16px rgba(60,50,30,0.06), 0 1px 3px rgba(60,50,30,0.04)" }}>{children}</div>
  </div>
);
const DashCard = ({ children }) => (
  <div style={{ background: "#fff", border: "1px solid #e7e0d4", borderRadius: 18, padding: 20, marginBottom: 14, textAlign: "left", boxShadow: "0 2px 10px rgba(60,50,30,0.05)" }}>{children}</div>
);
const cardLabel = { fontSize: 11, letterSpacing: 1, textTransform: "uppercase", color: "#8a857a", fontWeight: 700 };
const eyebrow = { fontSize: 11, letterSpacing: 2, textTransform: "uppercase", color: "#b06a3c", fontWeight: 600 };
const h1 = { fontFamily: "Georgia, serif", fontSize: 27, margin: "6px 0 8px", color: "#232826", fontWeight: 600 };
const monthBadge = { display: "inline-block", background: "#eef3f5", color: "#3b6478", fontSize: 13, fontWeight: 600, borderRadius: 20, padding: "6px 15px", margin: "2px auto 20px" };
const bigBtn = { display: "block", textAlign: "center", background: "#3b6478", color: "#fff", padding: "16px", borderRadius: 13, fontWeight: 600, cursor: "pointer", fontSize: 16, boxShadow: "0 2px 6px rgba(59,100,120,0.25)" };
const fieldLabel = { display: "block", fontSize: 11, color: "#8a857a", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.6, margin: "16px 0 6px" };
const input = { width: "100%", boxSizing: "border-box", border: "1.5px solid #e7e0d4", borderRadius: 12, padding: "15px", fontSize: 22, fontWeight: 700, background: "#f6f2ea", textAlign: "center", color: "#232826" };
const submitBtn = { width: "100%", marginTop: 18, background: "#3f7a52", color: "#fff", border: "none", borderRadius: 13, padding: "16px", fontSize: 16, fontWeight: 600, cursor: "pointer", boxShadow: "0 2px 6px rgba(63,122,82,0.25)" };
