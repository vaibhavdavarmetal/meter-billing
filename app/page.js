"use client";
import { useState, useEffect, Suspense } from "react";

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
// Tenants pay for the PREVIOUS month's usage, so show last month.
function billingMonthLabel() {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
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
  const [lockedInfo, setLockedInfo] = useState(null); // {reading, submittedAt}

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
          if (d && d.submitted) { setLockedInfo({ reading: d.reading, submittedAt: d.submittedAt }); setStage("locked"); }
        })
        .catch(() => {});
    }
  }, []);

  const onPhoto = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErr("");
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      const base64 = String(dataUrl).split(",")[1];
      setPhoto(base64);
      setMediaType(file.type || "image/jpeg");
      setPreview(dataUrl);
      setStage("confirm"); // go straight to manual entry, no AI
    };
    reader.readAsDataURL(file);
  };

  const requestSubmit = () => {
    if (!reading) { setErr("Please enter the meter number."); return; }
    setErr("");
    setShowConfirm(true);
  };

  const doSubmit = async () => {
    setShowConfirm(false);
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
      if (!res.ok) throw new Error();
      setStage("done");
    } catch {
      setErr("Could not submit. Please try again.");
    }
  };

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

  if (stage === "locked") {
    return (
      <Card>
        <div style={{ fontSize: 40, marginBottom: 8 }}>✓</div>
        <h1 style={h1}>Already submitted</h1>
        {propertyName && <div style={{ fontSize: 13, color: "#8a8375", marginTop: -8, marginBottom: 8 }}>{propertyName} · {tenantName}</div>}
        <p style={{ color: "#8a8375" }}>
          Your meter reading for {billingMonthLabel()} {lockedInfo && lockedInfo.reading != null ? <>(<strong>{lockedInfo.reading}</strong>) </> : ""}has already been submitted.
        </p>
        <p style={{ color: "#8a8375", fontSize: 14 }}>You can't submit again for this month. If it needs to be changed, please contact the owner to unlock it.</p>
      </Card>
    );
  }

  if (stage === "done") {
    return (
      <Card>
        <div style={{ fontSize: 40, marginBottom: 8 }}>✓</div>
        <h1 style={h1}>Thank you, {tenantName}</h1>
        <p style={{ color: "#8a8375" }}>Your reading of <strong>{reading}</strong> was submitted. You can close this page.</p>
      </Card>
    );
  }

  return (
    <Card>
      <div style={eyebrow}>Monthly electricity reading</div>
      <h1 style={h1}>{tenantName}</h1>
      {propertyName && <div style={{ fontSize: 13, color: "#8a8375", marginTop: -8, marginBottom: 4 }}>{propertyName}</div>}
      <div style={monthBadge}>Reading for {billingMonthLabel()}</div>

      <label style={bigBtn}>
        📷 {photo ? "Retake photo" : "Take a photo of your meter"}
        <input type="file" accept="image/*" capture="environment" onChange={onPhoto} style={{ display: "none" }} />
      </label>

      {preview && (
        <img src={preview} alt="meter" style={{ width: "100%", borderRadius: 12, margin: "14px 0", border: "1px solid #e4ddd0" }} />
      )}

      {stage === "confirm" && (
        <div>
          <p style={{ color: "#3b5b6b", fontWeight: 600 }}>
            Please type the number shown on your meter.
          </p>
          <label style={fieldLabel}>Meter number</label>
          <input
            inputMode="numeric"
            value={reading}
            onChange={(e) => setReading(e.target.value.replace(/[^0-9.]/g, ""))}
            style={input}
            placeholder="e.g. 4521"
          />
          {err && <p style={{ color: "#c0392b", fontSize: 14 }}>{err}</p>}
          <button onClick={requestSubmit} style={submitBtn}>Submit reading</button>
        </div>
      )}

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
    </Card>
  );
}

export default function Page() {
  return <Suspense><TenantForm /></Suspense>;
}

// ── inline styles ─────────────────────────────────────────────
const Card = ({ children }) => (
  <div style={{ maxWidth: 440, margin: "0 auto", padding: "28px 20px", minHeight: "100vh" }}>
    <div style={{ background: "#fff", border: "1px solid #e4ddd0", borderRadius: 18, padding: 22, textAlign: "center" }}>{children}</div>
  </div>
);
const eyebrow = { fontSize: 11, letterSpacing: 2, textTransform: "uppercase", color: "#a8613c", fontWeight: 700 };
const h1 = { fontFamily: "Georgia, serif", fontSize: 26, margin: "4px 0 8px" };
const monthBadge = { display: "inline-block", background: "#eef3f5", color: "#3b5b6b", fontSize: 13, fontWeight: 700, borderRadius: 20, padding: "6px 14px", margin: "0 auto 18px" };
const bigBtn = { display: "block", textAlign: "center", background: "#3b5b6b", color: "#fff", padding: "16px", borderRadius: 12, fontWeight: 700, cursor: "pointer", fontSize: 16 };
const fieldLabel = { display: "block", fontSize: 12, color: "#8a8375", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, margin: "14px 0 6px" };
const input = { width: "100%", boxSizing: "border-box", border: "1px solid #e4ddd0", borderRadius: 10, padding: "14px", fontSize: 20, fontWeight: 700, background: "#faf7f0", textAlign: "center" };
const submitBtn = { width: "100%", marginTop: 16, background: "#3f6b4a", color: "#fff", border: "none", borderRadius: 12, padding: "16px", fontSize: 16, fontWeight: 700, cursor: "pointer" };
