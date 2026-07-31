"use client";
import { useState } from "react";

function money(n) {
  if (!isFinite(n)) return "—";
  return "₹" + Math.round(n).toLocaleString("en-IN");
}
function thisPeriod() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function Admin() {
  const [pw, setPw] = useState("");
  const [period, setPeriod] = useState(thisPeriod());
  const [data, setData] = useState(null);
  const [prev, setPrev] = useState({}); // manually entered previous readings per slug
  const [totalBill, setTotalBill] = useState("");
  const [err, setErr] = useState("");
  const [approved, setApproved] = useState({}); // slug -> true once you approve
  const [override, setOverride] = useState({}); // slug -> your corrected current reading

  const load = async () => {
    setErr("");
    try {
      const res = await fetch(`/api/readings?period=${period}&pw=${encodeURIComponent(pw)}`);
      if (!res.ok) throw new Error();
      setData(await res.json());
      setApproved({});
      setOverride({});
    } catch {
      setErr("Wrong password or no data.");
    }
  };

  const waText = (propName, tName, prevV, currV, units, amount, mode, extra) => {
    const base = `Electricity bill — ${period}\n${propName} · ${tName}\n\nPrevious: ${prevV}\nCurrent: ${currV}\nUnits used: ${units}\n`;
    const tail = mode === "rate"
      ? `Rate: ₹${extra}/unit\n\nAmount payable: ${money(amount)}`
      : `Share of total bill (${money(extra)})\n\nAmount payable: ${money(amount)}`;
    return base + tail;
  };

  return (
    <div style={{ maxWidth: 560, margin: "0 auto", padding: "24px 16px" }}>
      <h1 style={{ fontFamily: "Georgia, serif" }}>Billing — Admin</h1>

      {!data && (
        <div style={{ background: "#fff", border: "1px solid #e4ddd0", borderRadius: 14, padding: 18 }}>
          <label style={lbl}>Period (YYYY-MM)</label>
          <input value={period} onChange={(e) => setPeriod(e.target.value)} style={inp} />
          <label style={lbl}>Admin password</label>
          <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} style={inp} />
          {err && <p style={{ color: "#c0392b" }}>{err}</p>}
          <button onClick={load} style={btn}>Load readings</button>
        </div>
      )}

      {data && Object.entries(data.properties).map(([pkey, prop]) => {
        // Only APPROVED readings count toward units/totals/bills.
        const rows = prop.tenants.map((t) => {
          const r = data.readings[t.slug];
          const submitted = r ? r.reading : null;              // number tenant confirmed
          const ai = r && r.aiReading != null ? r.aiReading : null; // what Claude read
          const isApproved = !!approved[t.slug];
          // The current value used for billing = your override if set, else submitted
          const ov = override[t.slug];
          const effective = ov !== undefined && ov !== "" ? Number(ov) : submitted;
          const prevV = Number(prev[t.slug] || 0);
          const units = !isApproved || effective == null ? null : Math.max(0, effective - prevV);
          const mismatch = ai != null && submitted != null && Number(ai) !== Number(submitted);
          return { t, submitted, ai, effective, prevV, units, mismatch, isApproved, photoUrl: r?.photoUrl, hasReading: !!r };
        });
        // Totals only include approved rows
        const totalUnits = rows.reduce((s, r) => s + (r.units || 0), 0);
        const billNum = Number(totalBill) || 0;

        return (
          <div key={pkey} style={{ marginTop: 20 }}>
            <h2 style={{ fontSize: 18 }}>{prop.name}</h2>
            {prop.mode === "proportional" && (
              <div style={{ margin: "8px 0" }}>
                <label style={lbl}>Actual total bill for {prop.name}</label>
                <input inputMode="decimal" value={totalBill} onChange={(e) => setTotalBill(e.target.value.replace(/[^0-9.]/g, ""))} style={inp} placeholder="₹" />
              </div>
            )}
            {rows.map(({ t, submitted, ai, effective, prevV, units, mismatch, isApproved, photoUrl, hasReading }) => {
              const amount = !isApproved || effective == null ? null
                : prop.mode === "rate" ? units * prop.rate
                : totalUnits === 0 ? 0 : (units / totalUnits) * billNum;
              const extra = prop.mode === "rate" ? prop.rate : billNum;

              return (
                <div key={t.slug} style={{ ...card, borderColor: mismatch && !isApproved ? "#a8613c" : "#e4ddd0" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <strong>{t.name}</strong>
                    {isApproved
                      ? <span style={{ fontFamily: "Georgia, serif", fontSize: 20, color: "#3f6b4a" }}>{amount == null ? "—" : money(amount)}</span>
                      : <span style={{ fontSize: 13, color: "#8a8375", fontWeight: 600 }}>{hasReading ? "awaiting your check" : "no submission"}</span>}
                  </div>

                  {!hasReading && (
                    <p style={{ fontSize: 13, color: "#8a8375", margin: "8px 0 0" }}>
                      This tenant hasn't submitted yet.
                    </p>
                  )}

                  {hasReading && (
                    <>
                      {/* AI vs typed comparison */}
                      <div style={{ display: "flex", gap: 10, margin: "10px 0" }}>
                        <div style={compareBox}>
                          <div style={lblSm}>AI read</div>
                          <div style={{ fontSize: 18, fontWeight: 700 }}>{ai ?? "—"}</div>
                        </div>
                        <div style={compareBox}>
                          <div style={lblSm}>Tenant typed</div>
                          <div style={{ fontSize: 18, fontWeight: 700 }}>{submitted ?? "—"}</div>
                        </div>
                      </div>

                      {mismatch && (
                        <div style={flagBox}>
                          ⚠ AI and tenant disagree — check the photo before approving.
                        </div>
                      )}

                      {photoUrl && (
                        <a href={photoUrl} target="_blank" rel="noreferrer" style={{ display: "block", margin: "8px 0" }}>
                          <img src={photoUrl} alt="meter" style={{ width: "100%", maxHeight: 220, objectFit: "contain", borderRadius: 10, border: "1px solid #e4ddd0", background: "#faf7f0" }} />
                          <span style={{ fontSize: 12, color: "#3b5b6b" }}>Tap to enlarge</span>
                        </a>
                      )}

                      {/* Previous + final (editable) reading */}
                      <div style={{ display: "flex", gap: 8, alignItems: "flex-end", margin: "8px 0" }}>
                        <div style={{ flex: 1 }}>
                          <label style={lblSm}>Previous</label>
                          <input inputMode="numeric" value={prev[t.slug] || ""} onChange={(e) => setPrev({ ...prev, [t.slug]: e.target.value.replace(/[^0-9.]/g, "") })} style={inpSm} placeholder="0" />
                        </div>
                        <div style={{ flex: 1 }}>
                          <label style={lblSm}>Final current reading</label>
                          <input
                            inputMode="numeric"
                            value={override[t.slug] !== undefined ? override[t.slug] : (submitted ?? "")}
                            onChange={(e) => setOverride({ ...override, [t.slug]: e.target.value.replace(/[^0-9.]/g, "") })}
                            disabled={isApproved}
                            style={{ ...inpSm, background: isApproved ? "#eef3f5" : "#fff" }}
                          />
                        </div>
                        <div style={{ textAlign: "center", minWidth: 46 }}>
                          <div style={{ fontWeight: 700, color: "#3b5b6b" }}>{units ?? "—"}</div>
                          <div style={{ fontSize: 10, color: "#8a8375" }}>units</div>
                        </div>
                      </div>

                      {/* Approve gate */}
                      {!isApproved ? (
                        <button onClick={() => setApproved({ ...approved, [t.slug]: true })} style={{ ...btn, background: "#3b5b6b" }}>
                          Approve this reading
                        </button>
                      ) : (
                        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                          <button onClick={() => setApproved({ ...approved, [t.slug]: false })} style={{ ...btn, background: "#fff", color: "#3b5b6b", border: "1px solid #e4ddd0", flex: "0 0 auto", width: "auto", padding: "14px 16px", marginTop: 0 }}>
                            Edit
                          </button>
                          <a
                            href={`https://wa.me/?text=${encodeURIComponent(waText(prop.name, t.name, prevV, effective, units, amount, prop.mode, extra))}`}
                            target="_blank" rel="noreferrer"
                            style={{ ...btn, textDecoration: "none", textAlign: "center", flex: 1, background: "#3f6b4a", marginTop: 0 }}
                          >
                            Send bill on WhatsApp
                          </a>
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
    </div>
  );
}

const lbl = { display: "block", fontSize: 12, color: "#8a8375", fontWeight: 700, margin: "10px 0 4px", textTransform: "uppercase", letterSpacing: 0.5 };
const lblSm = { display: "block", fontSize: 10, color: "#8a8375", fontWeight: 700, marginBottom: 2, textTransform: "uppercase" };
const inp = { width: "100%", boxSizing: "border-box", border: "1px solid #e4ddd0", borderRadius: 8, padding: 12, fontSize: 16, background: "#faf7f0" };
const inpSm = { width: "100%", boxSizing: "border-box", border: "1px solid #e4ddd0", borderRadius: 8, padding: 8, fontSize: 15, background: "#faf7f0" };
const btn = { width: "100%", background: "#1f2421", color: "#fff", border: "none", borderRadius: 10, padding: 14, fontWeight: 700, cursor: "pointer", marginTop: 10 };
const card = { background: "#fff", border: "1px solid #e4ddd0", borderRadius: 12, padding: 14, marginTop: 10 };
const compareBox = { flex: 1, textAlign: "center", background: "#faf7f0", border: "1px solid #e4ddd0", borderRadius: 10, padding: "8px 6px" };
const flagBox = { background: "#f7ede4", border: "1px solid #a8613c", color: "#8a4a24", borderRadius: 8, padding: "8px 10px", fontSize: 13, fontWeight: 600, margin: "4px 0" };
