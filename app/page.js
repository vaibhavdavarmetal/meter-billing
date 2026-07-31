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
  const [photo, setPhoto] = useState(null);       // base64
  const [mediaType, setMediaType] = useState("image/jpeg");
  const [preview, setPreview] = useState(null);
  const [aiReading, setAiReading] = useState(null);
  const [confidence, setConfidence] = useState(null);
  const [reading, setReading] = useState("");     // final value tenant confirms
  const [stage, setStage] = useState("start");    // start | reading | confirm | done
  const [err, setErr] = useState("");

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("t");
    if (t) {
      setSlug(t);
      // Prettify slug into a name if config lookup isn't wired client-side
      setTenantName(t.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()));
    }
  }, []);

  const onPhoto = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErr("");
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result;
      const base64 = String(dataUrl).split(",")[1];
      setPhoto(base64);
      setMediaType(file.type || "image/jpeg");
      setPreview(dataUrl);
      setStage("reading");
      // Ask Claude to read it
      try {
        const res = await fetch("/api/read-meter", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageBase64: base64, mediaType: file.type }),
        });
        const data = await res.json();
        setAiReading(data.reading);
        setConfidence(data.confidence);
        setReading(data.reading != null ? String(data.reading) : "");
        setStage("confirm");
      } catch {
        setAiReading(null);
        setConfidence("low");
        setStage("confirm");
      }
    };
    reader.readAsDataURL(file);
  };

  const submit = async () => {
    if (!reading) { setErr("Please enter the meter number."); return; }
    setErr("");
    try {
      const res = await fetch("/api/readings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, reading, aiReading, aiConfidence: confidence, imageBase64: photo, mediaType }),
      });
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
      <div style={monthBadge}>Reading for {billingMonthLabel()}</div>

      <label style={bigBtn}>
        📷 {photo ? "Retake photo" : "Take a photo of your meter"}
        <input type="file" accept="image/*" capture="environment" onChange={onPhoto} style={{ display: "none" }} />
      </label>

      {preview && (
        <img src={preview} alt="meter" style={{ width: "100%", borderRadius: 12, margin: "14px 0", border: "1px solid #e4ddd0" }} />
      )}

      {stage === "reading" && (
        <p style={{ color: "#3b5b6b", fontWeight: 600 }}>Reading your meter…</p>
      )}

      {stage === "confirm" && (
        <div>
          {aiReading != null ? (
            <p style={{ color: "#3f6b4a", fontWeight: 600 }}>
              We read <strong>{aiReading}</strong>{confidence !== "high" && " — please double-check it's right"}.
            </p>
          ) : (
            <p style={{ color: "#a8613c", fontWeight: 600 }}>
              We couldn't read it clearly. Please type the number from your meter.
            </p>
          )}
          <label style={fieldLabel}>Meter number</label>
          <input
            inputMode="numeric"
            value={reading}
            onChange={(e) => setReading(e.target.value.replace(/[^0-9.]/g, ""))}
            style={input}
            placeholder="e.g. 4521"
          />
          {err && <p style={{ color: "#c0392b", fontSize: 14 }}>{err}</p>}
          <button onClick={submit} style={submitBtn}>Submit reading</button>
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
