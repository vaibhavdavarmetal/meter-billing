"use client";
import { useState, useEffect, useCallback } from "react";

function money(n){ if(n==null||!isFinite(n)) return "—"; return "₹"+Math.round(n).toLocaleString("en-IN"); }
function thisPeriod(){ const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`; }
const MONTHS=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
function label(p){ const [y,m]=p.split("-").map(Number); return `${MONTHS[m-1]} ${y}`; }
function shiftPeriod(p,d){ let [y,m]=p.split("-").map(Number); m+=d; while(m<1){m+=12;y--;} while(m>12){m-=12;y++;} return `${y}-${String(m).padStart(2,"0")}`; }
function slugify(s){ return s.toLowerCase().trim().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,""); }

export default function Admin(){
  const [pw,setPw]=useState("");
  const [authed,setAuthed]=useState(false);
  const [view,setView]=useState("billing");
  const [period,setPeriod]=useState(thisPeriod());
  const [data,setData]=useState(null);
  const [loading,setLoading]=useState(false);
  const [err,setErr]=useState("");

  const [prev,setPrev]=useState({});
  const [override,setOverride]=useState({});
  const [approved,setApproved]=useState({});
  const [extras,setExtras]=useState({});
  const [saving,setSaving]=useState(false);
  const [savedMsg,setSavedMsg]=useState("");
  const [confirmSlug,setConfirmSlug]=useState(null); // tenant pending approve confirmation
  const [paidAmt,setPaidAmt]=useState({}); // slug -> amount actually paid (string)
  const [reportBusy,setReportBusy]=useState(false);

  // Build a bill record for one tenant (used by manual save AND mark-paid auto-save)
  const buildBill=(pkey,prop,t)=>{
    const r=data.readings?data.readings[t.slug]:null;
    const ov=override[t.slug];
    const eff= ov!==undefined&&ov!==""?Number(ov):(r?r.reading:null);
    const pv=Number(prev[t.slug]||0);
    const u= eff==null?0:Math.max(0,eff-pv);
    const ex=extras[t.slug]||{};
    const rent=Number(ex.rent)||0, misc=Number(ex.misc)||0;
    const elec= eff==null?0: u*(Number(prop.rate)||0);
    const carry=Number((data.carryIn&&data.carryIn[t.slug])||0);
    const amount=Math.round(elec+rent+misc+carry);
    const pa= paidAmt[t.slug]!==undefined&&paidAmt[t.slug]!==""?Number(paidAmt[t.slug]):null;
    const outstanding= pa!=null? Math.round(amount-pa) : null; // +owed, -credit; carries to next month
    return { slug:t.slug, propertyKey:pkey, previousReading:pv, currentReading:eff, units:u,
      electricity:Math.round(elec), rent, misc, carryIn:Math.round(carry), amount,
      paidAmount:pa, outstanding, paid:!!ex.paid, photoUrl:r?.photoUrl };
  };

  // Save one tenant's bill to history (used when marking paid)
  const saveOneBill=async(pkey,prop,t)=>{
    const bill=buildBill(pkey,prop,t);
    try{ await fetch("/api/readings",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"save-bill",pw,period,bills:[bill]})}); }catch{}
  };

  const [reg,setReg]=useState(null);
  const [regMsg,setRegMsg]=useState("");

  // house help
  const [staff,setStaff]=useState(null);
  const [staffEntries,setStaffEntries]=useState({});
  const [staffCarry,setStaffCarry]=useState({});
  const [staffPaid,setStaffPaid]=useState({});
  const [staffMsg,setStaffMsg]=useState("");

  const fetchPeriod=useCallback(async(p,password)=>{
    setLoading(true); setErr("");
    try{
      const res=await fetch(`/api/readings?period=${p}&pw=${encodeURIComponent(password)}`);
      if(res.status===401){ setErr("Wrong password."); setLoading(false); return false; }
      if(!res.ok) throw new Error();
      const d=await res.json();
      setData(d);
      const sp={}; Object.entries(d.autoPrevious||{}).forEach(([s,v])=>{ if(v!=null) sp[s]=String(v); });
      // approvals restore previous/current too
      const ap={};
      Object.entries(d.approvals||{}).forEach(([s,v])=>{ if(v&&v.approved){ ap[s]=true; if(v.previousReading!=null) sp[s]=String(v.previousReading); } });
      setPrev(sp); setApproved(ap);
      const ex={};
      Object.entries(d.properties).forEach(([pk,prop])=>{
        prop.tenants.forEach((t)=>{
          const e=d.extras&&d.extras[t.slug];
          ex[t.slug]={
            rent: e&&e.rent!=null?String(e.rent):(t.rent?String(t.rent):""),
            misc: e&&e.misc!=null?String(e.misc):(t.misc?String(t.misc):""),
            miscNote: e?(e.miscNote||""):"",
            paid: e?!!e.paid:false,
          };
        });
      });
      setExtras(ex); setOverride({}); setSavedMsg(""); setLoading(false); return true;
    }catch{ setErr("Could not load."); setLoading(false); return false; }
  },[]);

  const login=async()=>{ const ok=await fetchPeriod(period,pw); if(ok) setAuthed(true); };
  const changeMonth=async(d)=>{ const p=shiftPeriod(period,d); setPeriod(p); await fetchPeriod(p,pw); };

  const loadRegistry=async()=>{
    setRegMsg("");
    try{ const res=await fetch(`/api/registry?pw=${encodeURIComponent(pw)}`); if(!res.ok) throw new Error(); const d=await res.json(); setReg(d.properties); }
    catch{ setRegMsg("Could not load tenant list."); }
  };
  const openManage=async()=>{ setView("manage"); if(!reg) await loadRegistry(); };

  const loadStaff=async(p=period)=>{
    setStaffMsg("");
    try{
      const res=await fetch(`/api/staff?period=${p}&pw=${encodeURIComponent(pw)}`);
      if(!res.ok) throw new Error();
      const d=await res.json();
      setStaff(d.staff||[]);
      setStaffCarry(d.carryIn||{});
      const ent={};
      (d.staff||[]).forEach((s)=>{
        const e=d.entries&&d.entries[s.id];
        ent[s.id]={
          salary: e&&e.salary!=null?String(e.salary):(s.salary?String(s.salary):""),
          extra: e&&e.extra?String(e.extra):"",
          extraNote: e?e.extraNote||"":"",
          deduction: e&&e.deduction?String(e.deduction):"",
          deductionNote: e?e.deductionNote||"":"",
          paid: e?!!e.paid:false,
          savedPaidAmount: e&&e.paidAmount!=null?e.paidAmount:null,
          savedOutstanding: e&&e.outstanding!=null?e.outstanding:null,
        };
      });
      setStaffEntries(ent);
      const sp={}; (d.staff||[]).forEach((s)=>{ const e=d.entries&&d.entries[s.id]; if(e&&e.paidAmount!=null) sp[s.id]=String(e.paidAmount); });
      setStaffPaid(sp);
    }catch{ setStaffMsg("Could not load house help."); }
  };
  const openStaff=async()=>{ setView("staff"); await loadStaff(); };

  const setStaffField=(id,f,v)=> setStaffEntries(p=>({...p,[id]:{...p[id],[f]:v}}));

  const saveStaffList=async(list)=>{
    try{
      const res=await fetch("/api/staff",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"save-staff",pw,staff:list})});
      const d=await res.json();
      if(d.staff) setStaff(d.staff);
      return d.staff;
    }catch{ return null; }
  };

  const saveStaffEntry=async(s)=>{
    const e=staffEntries[s.id]||{};
    const salary=Number(e.salary)||0, extra=Number(e.extra)||0, deduction=Number(e.deduction)||0;
    const carry=Number(staffCarry[s.id]||0);
    const due=salary+extra-deduction+carry;
    const pa= staffPaid[s.id]!==undefined&&staffPaid[s.id]!==""?Number(staffPaid[s.id]):null;
    const outstanding= pa!=null? Math.round(due-pa): null;
    try{
      await fetch("/api/staff",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"save-entry",pw,period,id:s.id,
        entry:{salary,extra,extraNote:e.extraNote||"",deduction,deductionNote:e.deductionNote||"",carryIn:carry,due:Math.round(due),paidAmount:pa,outstanding,paid:!!e.paid}})});
      await loadStaff();
      setStaffMsg("Saved "+s.name+" for "+label(period)+".");
    }catch{ setStaffMsg("Could not save."); }
  };

  const renderStaff=()=>{
    if(!staff) return <p style={{color:"#8a8375"}}>{staffMsg||"Loading house help…"}</p>;
    const addStaff=async()=>{ const list=[...(staff||[]),{id:"",name:"New helper",salary:0}]; await saveStaffList(list); await loadStaff(); };
    const removeStaff=async(id)=>{ if(!window.confirm("Remove this helper? Past records stay saved.")) return; const list=(staff||[]).filter(s=>s.id!==id); await saveStaffList(list); await loadStaff(); };
    const renameStaff=(id,field,val)=> setStaff(staff.map(s=>s.id===id?{...s,[field]:val}:s));
    return (
      <>
        <p style={{fontSize:13,color:"#8a8375"}}>Track monthly pay for house help. Salary + extra − deduction + last month's balance = amount due. Enter what you actually paid; any difference carries to next month.</p>
        {staff.length===0&&<p style={{fontSize:14,color:"#8a8375"}}>No house help added yet.</p>}
        {staff.map((s)=>{
          const e=staffEntries[s.id]||{salary:"",extra:"",deduction:"",paid:false};
          const salary=Number(e.salary)||0, extra=Number(e.extra)||0, deduction=Number(e.deduction)||0;
          const carry=Number(staffCarry[s.id]||0);
          const due=salary+extra-deduction+carry;
          const pa= staffPaid[s.id]!==undefined&&staffPaid[s.id]!==""?Number(staffPaid[s.id]):null;
          const out= pa!=null?Math.round(due-pa):null;
          return (
            <div key={s.id} style={{...card}}>
              <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:8}}>
                <input value={s.name} onChange={e=>renameStaff(s.id,"name",e.target.value)} onBlur={()=>saveStaffList(staff)} style={{...inp,fontWeight:700,flex:1}}/>
                <button onClick={()=>removeStaff(s.id)} style={{...btn,background:"#fff",color:"#c0392b",border:"1px solid #e4ddd0",width:"auto",padding:"10px 12px",marginTop:0}}>Remove</button>
              </div>
              {carry!==0&&<div style={{fontSize:13,marginBottom:8,color:carry>0?"#a8613c":"#3f6b4a"}}>{carry>0?`Owed from last month: +${money(carry)}`:`Advance from last month: ${money(carry)}`}</div>}
              <div style={{display:"flex",gap:8}}>
                <div style={{flex:1}}><label style={lblSm}>Salary ₹</label><input inputMode="numeric" value={e.salary} onChange={ev=>setStaffField(s.id,"salary",ev.target.value.replace(/[^0-9.]/g,""))} style={inpSm} placeholder="0"/></div>
                <div style={{flex:1}}><label style={lblSm}>Extra ₹</label><input inputMode="numeric" value={e.extra} onChange={ev=>setStaffField(s.id,"extra",ev.target.value.replace(/[^0-9.]/g,""))} style={inpSm} placeholder="0"/></div>
                <div style={{flex:1}}><label style={lblSm}>Deduct ₹</label><input inputMode="numeric" value={e.deduction} onChange={ev=>setStaffField(s.id,"deduction",ev.target.value.replace(/[^0-9.]/g,""))} style={inpSm} placeholder="0"/></div>
              </div>
              <input value={e.extraNote} onChange={ev=>setStaffField(s.id,"extraNote",ev.target.value)} style={{...inpSm,marginTop:6}} placeholder="Note for extra/advance (optional)"/>
              <input value={e.deductionNote} onChange={ev=>setStaffField(s.id,"deductionNote",ev.target.value)} style={{...inpSm,marginTop:6}} placeholder="Note for deduction (optional)"/>
              <div style={{fontSize:14,margin:"10px 0 8px"}}>Amount due: <strong>{money(due)}</strong> <span style={{fontSize:12,color:"#8a8375"}}>(salary {money(salary)}{extra?` + extra ${money(extra)}`:""}{deduction?` − deduct ${money(deduction)}`:""}{carry?` ${carry>0?"+":"−"} bal ${money(Math.abs(carry))}`:""})</span></div>
              <label style={lblSm}>Amount actually paid ₹</label>
              <input inputMode="numeric" value={staffPaid[s.id]??""} onChange={ev=>setStaffPaid({...staffPaid,[s.id]:ev.target.value.replace(/[^0-9.]/g,"")})} style={inpSm} placeholder={String(Math.round(due))}/>
              {pa!=null&&<div style={{fontSize:12,marginTop:4,color:out>0?"#a8613c":out<0?"#3f6b4a":"#8a8375"}}>{out>0?`Short ${money(out)} — carries to next month`:out<0?`Paid extra ${money(-out)} — advance next month`:"Settled exactly"}</div>}
              <div style={{display:"flex",gap:8,alignItems:"center",marginTop:12}}>
                <button onClick={()=>saveStaffEntry(s)} style={{...btn,background:"#3b5b6b",marginTop:0}}>Save {label(period)}</button>
                <div style={{marginLeft:"auto"}}><PaidSlider on={e.paid} onChange={(v)=>{ setStaffField(s.id,"paid",v); }}/></div>
              </div>
            </div>
          );
        })}
        <button onClick={addStaff} style={{...btn,background:"#eef3f5",color:"#3b5b6b",marginTop:12}}>+ Add house help</button>
        {staffMsg&&<p style={{fontSize:13,color:staffMsg.startsWith("Saved")?"#3f6b4a":"#c0392b",textAlign:"center",marginTop:8}}>{staffMsg}</p>}
      </>
    );
  };

  const setExtra=(slug,f,v)=> setExtras(p=>({...p,[slug]:{...p[slug],[f]:v}}));
  const persistExtra=async(slug)=>{ const e=extras[slug]; if(!e) return; try{ await fetch("/api/readings",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"save-extras",pw,period,slug,extras:e})}); }catch{} };

  const persistApproval=async(slug,isApproved,prevV,currV)=>{
    try{ await fetch("/api/readings",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"save-approval",pw,period,slug,approval:isApproved,previousReading:prevV,currentReading:currV})}); }catch{}
  };

  const doApprove=(slug,prevV,currV)=>{ setApproved(a=>({...a,[slug]:true})); persistApproval(slug,true,prevV,currV); setConfirmSlug(null); };
  const unApprove=(slug)=>{ setApproved(a=>({...a,[slug]:false})); persistApproval(slug,false); };

  const resetSubmission=async(slug)=>{
    if(!window.confirm("Unlock this tenant so they can submit a new photo for "+label(period)+"? The current reading stays visible to you until they resubmit.")) return;
    try{
      await fetch("/api/readings",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"reset-submission",pw,period,slug})});
      await fetchPeriod(period,pw);
    }catch{}
  };

  const waText=(propName,tName,parts,total)=>{
    let s=`Bill — ${label(period)}\n${propName} · ${tName}\n\n`;
    parts.forEach(p=>{ s+=`${p.label}: ${money(p.amount)}\n`; });
    s+=`\nTotal payable: ${money(total)}`; return s;
  };

  if(!authed){
    return (
      <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
        <div style={{width:"100%",maxWidth:340,background:"#fff",border:"1px solid #e4ddd0",borderRadius:16,padding:24}}>
          <div style={{fontSize:11,letterSpacing:2,textTransform:"uppercase",color:"#a8613c",fontWeight:700}}>Rent and electricity management</div>
          <h1 style={{fontFamily:"Georgia, serif",fontSize:24,margin:"4px 0 18px"}}>Home admin sign in</h1>
          <label style={lbl}>Password</label>
          <input type="password" value={pw} onChange={e=>setPw(e.target.value)} onKeyDown={e=>e.key==="Enter"&&login()} style={inp} placeholder="Enter admin password" autoFocus/>
          {err&&<p style={{color:"#c0392b",fontSize:14}}>{err}</p>}
          <button onClick={login} style={btn} disabled={loading}>{loading?"Checking…":"Sign in"}</button>
        </div>
      </div>
    );
  }

  // ── MANAGE ──
  const renderManage=()=>{
    if(!reg) return <p style={{color:"#8a8375"}}>{regMsg||"Loading tenants…"}</p>;
    const setProp=(pk,f,v)=>setReg({...reg,[pk]:{...reg[pk],[f]:v}});
    const setTen=(pk,i,f,v)=>{ const n=structuredClone(reg); n[pk].tenants[i][f]=v; setReg(n); };
    const addTen=(pk)=>{ const n=structuredClone(reg); n[pk].tenants.push({slug:pk+"-"+(n[pk].tenants.length+1),name:"New Tenant",rent:0,misc:0}); setReg(n); };
    const removeTen=(pk,i)=>{ const n=structuredClone(reg); n[pk].tenants.splice(i,1); setReg(n); };
    const save=async()=>{
      setRegMsg("");
      const fixed=structuredClone(reg);
      Object.values(fixed).forEach(p=>{ p.rate=Number(p.rate)||0; p.tenants.forEach(t=>{ if(!t.slug) t.slug=slugify(t.name); t.rent=Number(t.rent)||0; t.misc=Number(t.misc)||0; t.startReading=Number(t.startReading)||0; }); });
      try{
        const res=await fetch("/api/registry",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({pw,properties:fixed})});
        const d=await res.json();
        if(!res.ok){ setRegMsg(d.error||"Could not save."); return; }
        setReg(fixed); setRegMsg("Saved. Changes are live.");
      }catch{ setRegMsg("Could not save."); }
    };
    return (
      <div>
        <p style={{fontSize:13,color:"#8a8375"}}>Edit names, the per-unit rate, default rent, and default misc for each tenant. Defaults auto-fill billing each month; you can still override misc there. Changes go live after you save.</p>
        {Object.entries(reg).map(([pk,prop])=>(
          <div key={pk} style={{marginTop:18}}>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
              <input value={prop.name} onChange={e=>setProp(pk,"name",e.target.value)} style={{...inp,fontWeight:700,flex:1}}/>
              <div style={{display:"flex",alignItems:"center",gap:4}}>
                <span style={{fontSize:12,color:"#8a8375"}}>₹/unit</span>
                <input inputMode="decimal" value={prop.rate??""} onChange={e=>setProp(pk,"rate",e.target.value.replace(/[^0-9.]/g,""))} style={{...inpSm,width:64}}/>
              </div>
            </div>
            {prop.tenants.map((t,i)=>(
              <div key={i} style={{...card,padding:12}}>
                <div style={{display:"flex",gap:8,marginBottom:6}}>
                  <div style={{flex:1}}><label style={lblSm}>Name</label><input value={t.name} onChange={e=>setTen(pk,i,"name",e.target.value)} style={inpSm}/></div>
                  <div style={{width:84}}><label style={lblSm}>Rent ₹</label><input inputMode="numeric" value={t.rent??""} onChange={e=>setTen(pk,i,"rent",e.target.value.replace(/[^0-9.]/g,""))} style={inpSm}/></div>
                  <div style={{width:84}}><label style={lblSm}>Misc ₹</label><input inputMode="numeric" value={t.misc??""} onChange={e=>setTen(pk,i,"misc",e.target.value.replace(/[^0-9.]/g,""))} style={inpSm}/></div>
                </div>
                <div style={{display:"flex",gap:8,alignItems:"flex-end"}}>
                  <div style={{flex:1}}><label style={lblSm}>Link id (slug)</label><input value={t.slug} onChange={e=>setTen(pk,i,"slug",e.target.value.replace(/[^a-z0-9-]/g,""))} style={{...inpSm,fontFamily:"monospace"}}/></div>
                  <div style={{width:110}}><label style={lblSm}>July start reading</label><input inputMode="numeric" value={t.startReading??""} onChange={e=>setTen(pk,i,"startReading",e.target.value.replace(/[^0-9.]/g,""))} style={inpSm} placeholder="from diary"/></div>
                  {!prop.isTest&&<button onClick={()=>removeTen(pk,i)} style={{...btn,background:"#fff",color:"#c0392b",border:"1px solid #e4ddd0",width:"auto",padding:"10px 12px",marginTop:0}}>Remove</button>}
                </div>
              </div>
            ))}
            {!prop.isTest&&<button onClick={()=>addTen(pk)} style={{...btn,background:"#eef3f5",color:"#3b5b6b",marginTop:8}}>+ Add tenant to {prop.name}</button>}
          </div>
        ))}
        <button onClick={save} style={{...btn,background:"#1f2421",marginTop:20}}>Save changes</button>
        {regMsg&&<p style={{fontSize:13,color:regMsg.startsWith("Saved")?"#3f6b4a":"#c0392b",textAlign:"center",marginTop:8}}>{regMsg}</p>}
      </div>
    );
  };

  // ── BILLING ──
  const renderBilling=()=>(
    <>
      {loading&&<p style={{color:"#8a8375"}}>Loading {label(period)}…</p>}
      {data&&Object.entries(data.properties).map(([pkey,prop])=>(
        <div key={pkey} style={{marginTop:20}}>
          <h2 style={{fontSize:17,display:"flex",alignItems:"center",gap:8}}>
            {prop.name}
            {prop.isTest&&<span style={{fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:.5,color:"#8a4a24",background:"#f7ede4",border:"1px solid #a8613c",borderRadius:6,padding:"2px 8px"}}>practice</span>}
          </h2>
          {prop.isTest&&<p style={{fontSize:12,color:"#8a8375",margin:"0 0 4px"}}>Safe to experiment — never affects real bills.</p>}
          {prop.tenants.map((t)=>{
            const saved=data.bills?data.bills[t.slug]:null;
            const r=data.readings?data.readings[t.slug]:null;
            const submitted=r?r.reading:null;
            const ai=r&&r.aiReading!=null?r.aiReading:null;
            const isApproved=!!approved[t.slug];
            const ov=override[t.slug];
            const effective= ov!==undefined&&ov!==""?Number(ov): submitted!=null?submitted: saved?saved.currentReading:null;
            const prevV=Number(prev[t.slug]||0);
            const units=effective==null?null:Math.max(0,effective-prevV);
            const mismatch=ai!=null&&submitted!=null&&Number(ai)!==Number(submitted);
            const photoUrl=r?.photoUrl||saved?.photoUrl;
            const hasReading=!!r;
            const ex=extras[t.slug]||{rent:"",misc:"",miscNote:"",paid:false};
            const rent=Number(ex.rent)||0, misc=Number(ex.misc)||0;
            const carry=Number((data.carryIn&&data.carryIn[t.slug])||0);
            const elec= effective==null?null: units*(Number(prop.rate)||0);
            const total= elec==null?null: elec+rent+misc+carry;

            if(saved){
              return (
                <div key={t.slug} style={{...card,borderColor:"#cfe0d4"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <strong>{t.name}</strong>
                    <span style={{fontFamily:"Georgia, serif",fontSize:20,color:"#3f6b4a"}}>{money(saved.amount)}</span>
                  </div>
                  <div style={{fontSize:13,color:"#8a8375",marginTop:6}}>Electricity {money(saved.electricity)} · Rent {money(saved.rent)} · Misc {money(saved.misc)}{saved.carryIn?` · Adj ${money(saved.carryIn)}`:""}</div>
                  <div style={{fontSize:12,color:"#8a8375",marginTop:4}}>prev {saved.previousReading} → curr {saved.currentReading} ({saved.units} units)</div>
                  {saved.paidAmount!=null&&(
                    <div style={{fontSize:13,marginTop:6,color: (saved.outstanding||0)>0?"#a8613c":(saved.outstanding||0)<0?"#3f6b4a":"#8a8375"}}>
                      Paid {money(saved.paidAmount)} · {(saved.outstanding||0)>0?`Short ${money(saved.outstanding)} (carries to next month)`:(saved.outstanding||0)<0?`Overpaid ${money(-saved.outstanding)} (credit next month)`:"Settled exactly"}
                    </div>
                  )}
                  <div style={{display:"flex",alignItems:"center",gap:10,marginTop:10}}>
                    <span style={{fontSize:12,color:"#3f6b4a"}}>✓ Billed {saved.savedAt?new Date(saved.savedAt).toLocaleDateString("en-IN"):""}</span>
                    <div style={{marginLeft:"auto"}}><PaidSlider on={ex.paid} onChange={(v)=>{ setExtra(t.slug,"paid",v); setTimeout(()=>persistExtra(t.slug),0); }}/></div>
                  </div>
                  {photoUrl&&<div style={{marginTop:8}}><img src={photoUrl} alt="meter" style={{width:"100%",maxHeight:240,objectFit:"contain",borderRadius:10,border:"1px solid #e4ddd0",background:"#faf7f0"}}/></div>}
                </div>
              );
            }

            return (
              <div key={t.slug} style={{...card,borderColor:mismatch&&!isApproved?"#a8613c":"#e4ddd0"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <strong>{t.name}</strong>
                  {isApproved?<span style={{fontFamily:"Georgia, serif",fontSize:20,color:"#3f6b4a"}}>{money(total)}</span>
                    :<span style={{fontSize:13,color:"#8a8375",fontWeight:600}}>{hasReading?"awaiting your check":"no submission"}</span>}
                </div>

                {hasReading&&(
                  <>
                    <div style={{display:"flex",gap:10,margin:"10px 0"}}>
                      <div style={compareBox}><div style={lblSm}>AI read</div><div style={{fontSize:18,fontWeight:700}}>{ai??"—"}</div></div>
                      <div style={compareBox}><div style={lblSm}>Tenant typed</div><div style={{fontSize:18,fontWeight:700}}>{submitted??"—"}</div></div>
                    </div>
                    {mismatch&&<div style={flagBox}>⚠ AI and tenant disagree — check the photo before approving.</div>}
                    {photoUrl&&<div style={{margin:"8px 0"}}><div style={{...lblSm,marginBottom:4}}>Meter photo</div><img src={photoUrl} alt="meter" style={{width:"100%",maxHeight:280,objectFit:"contain",borderRadius:10,border:"1px solid #e4ddd0",background:"#faf7f0"}}/></div>}
                    {r&&r.unlockedForResubmit&&<div style={{fontSize:12,color:"#a8613c",marginBottom:6}}>Unlocked — tenant can submit again.</div>}
                    {!isApproved&&<button onClick={()=>resetSubmission(t.slug)} style={{...btn,background:"#fff",color:"#a8613c",border:"1px solid #e4ddd0",marginTop:0,marginBottom:4,padding:"10px"}}>Unlock / reset tenant submission</button>}
                  </>
                )}
                {!hasReading&&<p style={{fontSize:13,color:"#8a8375",margin:"8px 0 0"}}>No meter reading for {label(period)} yet. You can still bill rent + misc.</p>}

                {/* Readings row — always visible */}
                <div style={{display:"flex",gap:8,alignItems:"flex-end",margin:"8px 0"}}>
                  <div style={{flex:1}}><label style={lblSm}>Previous {prev[t.slug]?"(auto)":""}</label><input inputMode="numeric" value={prev[t.slug]||""} onChange={e=>setPrev({...prev,[t.slug]:e.target.value.replace(/[^0-9.]/g,"")})} disabled={isApproved} style={{...inpSm,background:isApproved?"#eef3f5":"#faf7f0"}} placeholder="0"/></div>
                  <div style={{flex:1}}><label style={lblSm}>Current</label><input inputMode="numeric" value={override[t.slug]!==undefined?override[t.slug]:(submitted??"")} onChange={e=>setOverride({...override,[t.slug]:e.target.value.replace(/[^0-9.]/g,"")})} disabled={isApproved} style={{...inpSm,background:isApproved?"#eef3f5":"#fff"}}/></div>
                  <div style={{textAlign:"center",minWidth:46}}><div style={{fontWeight:700,color:"#3b5b6b"}}>{units??"—"}</div><div style={{fontSize:10,color:"#8a8375"}}>units</div></div>
                </div>

                {/* Electricity amount — always visible */}
                <div style={{fontSize:13,color:"#8a8375",marginBottom:8}}>Electricity: {units!=null?`${units} × ₹${prop.rate} = `:""}<strong style={{color:"#1f2421"}}>{money(elec)}</strong></div>

                {carry!==0&&(
                  <div style={{fontSize:13,marginBottom:8,color:carry>0?"#a8613c":"#3f6b4a"}}>
                    {carry>0?`Carried from last month: +${money(carry)} (was short)`:`Credit from last month: ${money(carry)} (overpaid)`}
                  </div>
                )}

                {/* Rent + misc — override allowed */}
                <div style={{display:"flex",gap:8}}>
                  <div style={{flex:1}}><label style={lblSm}>Rent ₹</label><input inputMode="numeric" value={ex.rent} onChange={e=>setExtra(t.slug,"rent",e.target.value.replace(/[^0-9.]/g,""))} onBlur={()=>persistExtra(t.slug)} style={inpSm} placeholder="0"/></div>
                  <div style={{flex:1}}><label style={lblSm}>Misc ₹</label><input inputMode="numeric" value={ex.misc} onChange={e=>setExtra(t.slug,"misc",e.target.value.replace(/[^0-9.]/g,""))} onBlur={()=>persistExtra(t.slug)} style={inpSm} placeholder="0"/></div>
                </div>
                <input value={ex.miscNote} onChange={e=>setExtra(t.slug,"miscNote",e.target.value)} onBlur={()=>persistExtra(t.slug)} style={{...inpSm,marginTop:6}} placeholder="Misc note (e.g. water, repair)"/>

                {!isApproved?(
                  <button onClick={()=>setConfirmSlug(t.slug)} style={{...btn,background:"#3b5b6b",marginTop:10}} disabled={!hasReading&&rent===0&&misc===0}>Approve bill</button>
                ):(
                  <div style={{marginTop:12}}>
                    <div style={{fontSize:13,color:"#8a8375",marginBottom:8}}>{elec!=null&&<>Electricity {money(elec)} · </>}Rent {money(rent)} · Misc {money(misc)}{carry!==0?` · Adj ${money(carry)}`:""} → <strong style={{color:"#1f2421"}}>{money((elec||0)+rent+misc+carry)}</strong></div>
                    <div style={{display:"flex",gap:8,alignItems:"center"}}>
                      <button onClick={()=>unApprove(t.slug)} style={{...btn,background:"#fff",color:"#3b5b6b",border:"1px solid #e4ddd0",width:"auto",padding:"12px 14px",marginTop:0}}>Edit</button>
                      <a href={`https://wa.me/?text=${encodeURIComponent(waText(prop.name,t.name,[...(elec!=null?[{label:`Electricity (${units} units)`,amount:elec}]:[]),{label:"Rent",amount:rent},...(misc>0?[{label:"Misc"+(ex.miscNote?` (${ex.miscNote})`:""),amount:misc}]:[]),...(carry!==0?[{label:carry>0?"Previous balance":"Previous credit",amount:carry}]:[])],(elec||0)+rent+misc+carry))}`} target="_blank" rel="noreferrer" style={{...btn,textDecoration:"none",textAlign:"center",flex:1,background:"#3f6b4a",marginTop:0}}>Send bill on WhatsApp</a>
                    </div>
                    <div style={{marginTop:12}}>
                      <label style={lblSm}>Amount actually paid ₹ (leave blank if paid in full)</label>
                      <input inputMode="numeric" value={paidAmt[t.slug]??""} onChange={e=>setPaidAmt({...paidAmt,[t.slug]:e.target.value.replace(/[^0-9.]/g,"")})} style={inpSm} placeholder={String(Math.round((elec||0)+rent+misc+carry))}/>
                      {paidAmt[t.slug]!==undefined&&paidAmt[t.slug]!==""&&(()=>{ const out=Math.round((elec||0)+rent+misc+carry-Number(paidAmt[t.slug])); return <div style={{fontSize:12,marginTop:4,color:out>0?"#a8613c":out<0?"#3f6b4a":"#8a8375"}}>{out>0?`Short ${money(out)} — carries to next month`:out<0?`Overpaid ${money(-out)} — credit next month`:"Settled exactly"}</div>; })()}
                    </div>
                    <div style={{display:"flex",alignItems:"center",gap:10,marginTop:12}}>
                      <span style={{fontSize:13,color:"#8a8375"}}>Mark paid saves to history</span>
                      <div style={{marginLeft:"auto"}}><PaidSlider on={ex.paid} onChange={(v)=>{ setExtra(t.slug,"paid",v); setTimeout(async()=>{ await persistExtra(t.slug); if(v){ await saveOneBill(pkey,prop,t); await fetchPeriod(period,pw); } },0); }}/></div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}

      {data&&(
        <div style={{marginTop:24}}>
          <button onClick={async()=>{
            setSaving(true); setSavedMsg("");
            const bills=[];
            Object.entries(data.properties).forEach(([pkey,prop])=>{
              prop.tenants.forEach((t)=>{
                if(!approved[t.slug]) return;
                const b=buildBill(pkey,prop,t);
                if(b.currentReading==null && b.rent===0 && b.misc===0) return;
                bills.push(b);
              });
            });
            if(bills.length===0){ setSavedMsg("Approve at least one bill first."); setSaving(false); return; }
            try{
              const res=await fetch("/api/readings",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"save-bill",pw,period,bills})});
              if(!res.ok) throw new Error();
              setSavedMsg(`Saved ${bills.length} bill(s) for ${label(period)}.`);
              await fetchPeriod(period,pw);
            }catch{ setSavedMsg("Could not save. Try again."); }
            setSaving(false);
          }} style={{...btn,background:"#1f2421"}} disabled={saving}>{saving?"Saving…":"Save all approved bills to history"}</button>
          {savedMsg&&<p style={{fontSize:13,color:"#3f6b4a",textAlign:"center",marginTop:8}}>{savedMsg}</p>}

          <div style={{display:"flex",gap:8,marginTop:16}}>
            <a href={`/api/report?scope=month&period=${period}&pw=${encodeURIComponent(pw)}`} style={{...btn,background:"#eef3f5",color:"#3b5b6b",textDecoration:"none",textAlign:"center",marginTop:0}}>⬇ This month (CSV)</a>
            <a href={`/api/report?scope=year&year=${period.split("-")[0]}&pw=${encodeURIComponent(pw)}`} style={{...btn,background:"#eef3f5",color:"#3b5b6b",textDecoration:"none",textAlign:"center",marginTop:0}}>⬇ Full year (CSV)</a>
          </div>
          <p style={{fontSize:12,color:"#8a8375",textAlign:"center",marginTop:6}}>Reports include only bills saved to history. Opens as a spreadsheet.</p>
        </div>
      )}
    </>
  );

  return (
    <div style={{maxWidth:560,margin:"0 auto",padding:"20px 16px 48px"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
        <h1 style={{fontFamily:"Georgia, serif",fontSize:22,margin:0}}>{view==="billing"?"Billing":view==="manage"?"Manage tenants":"House help"}</h1>
        {(view==="billing"||view==="staff")&&(
          <div style={{display:"flex",alignItems:"center",gap:4,background:"#fff",border:"1px solid #e4ddd0",borderRadius:10,padding:4}}>
            <button onClick={async()=>{ const p=shiftPeriod(period,-1); setPeriod(p); if(view==="staff"){await loadStaff(p);}else{await fetchPeriod(p,pw);} }} style={stepBtn} aria-label="Previous month">‹</button>
            <div style={{fontSize:14,fontWeight:600,minWidth:84,textAlign:"center"}}>{label(period)}</div>
            <button onClick={async()=>{ const p=shiftPeriod(period,1); setPeriod(p); if(view==="staff"){await loadStaff(p);}else{await fetchPeriod(p,pw);} }} style={stepBtn} aria-label="Next month">›</button>
          </div>
        )}
      </div>

      <div style={{display:"flex",gap:8,marginBottom:16}}>
        <button onClick={()=>setView("billing")} style={{...tabBtn,...(view==="billing"?tabActive:{})}}>Billing</button>
        <button onClick={openManage} style={{...tabBtn,...(view==="manage"?tabActive:{})}}>Tenants</button>
        <button onClick={openStaff} style={{...tabBtn,...(view==="staff"?tabActive:{})}}>House help</button>
      </div>

      {view==="billing"?renderBilling():view==="manage"?renderManage():renderStaff()}

      {/* Approve confirmation dialog */}
      {confirmSlug&&(
        <div style={{position:"fixed",inset:0,background:"rgba(31,36,33,0.45)",display:"flex",alignItems:"center",justifyContent:"center",padding:20,zIndex:50}} onClick={()=>setConfirmSlug(null)}>
          <div style={{background:"#fff",borderRadius:16,padding:22,maxWidth:340,width:"100%"}} onClick={e=>e.stopPropagation()}>
            <h3 style={{margin:"0 0 8px",fontFamily:"Georgia, serif"}}>Approve this bill?</h3>
            <p style={{fontSize:14,color:"#8a8375",margin:"0 0 18px"}}>Once approved, you can send it on WhatsApp and mark it paid. You can still tap Edit to change it.</p>
            <div style={{display:"flex",gap:8}}>
              <button onClick={()=>setConfirmSlug(null)} style={{...btn,background:"#fff",color:"#3b5b6b",border:"1px solid #e4ddd0",marginTop:0}}>Cancel</button>
              <button onClick={()=>{ const s=confirmSlug; const pv=Number(prev[s]||0); const r=data.readings?data.readings[s]:null; const ov=override[s]; const cv= ov!==undefined&&ov!==""?Number(ov):(r?r.reading:null); doApprove(s,pv,cv); }} style={{...btn,background:"#3f6b4a",marginTop:0}}>Approve</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PaidSlider({on,onChange}){
  return (
    <button onClick={()=>onChange(!on)} aria-label={on?"Mark unpaid":"Mark paid"} style={{display:"inline-flex",alignItems:"center",gap:8,border:"none",background:"transparent",cursor:"pointer"}}>
      <span style={{fontSize:13,fontWeight:700,color:on?"#3f6b4a":"#8a8375"}}>{on?"Paid":"Unpaid"}</span>
      <span style={{width:46,height:26,borderRadius:20,background:on?"#3f6b4a":"#d3d1c7",position:"relative",transition:"background .2s"}}>
        <span style={{position:"absolute",top:3,left:on?23:3,width:20,height:20,borderRadius:"50%",background:"#fff",transition:"left .2s",boxShadow:"0 1px 3px rgba(0,0,0,0.2)"}}/>
      </span>
    </button>
  );
}

const lbl={display:"block",fontSize:12,color:"#8a8375",fontWeight:700,margin:"10px 0 4px",textTransform:"uppercase",letterSpacing:.5};
const lblSm={display:"block",fontSize:10,color:"#8a8375",fontWeight:700,marginBottom:2,textTransform:"uppercase"};
const inp={width:"100%",boxSizing:"border-box",border:"1px solid #e4ddd0",borderRadius:8,padding:12,fontSize:16,background:"#faf7f0"};
const inpSm={width:"100%",boxSizing:"border-box",border:"1px solid #e4ddd0",borderRadius:8,padding:8,fontSize:15,background:"#faf7f0"};
const btn={width:"100%",background:"#1f2421",color:"#fff",border:"none",borderRadius:10,padding:14,fontWeight:700,cursor:"pointer",marginTop:10};
const stepBtn={border:"none",background:"transparent",fontSize:20,width:30,height:30,cursor:"pointer",color:"#3b5b6b",borderRadius:6};
const card={background:"#fff",border:"1px solid #e4ddd0",borderRadius:12,padding:14,marginTop:10};
const compareBox={flex:1,textAlign:"center",background:"#faf7f0",border:"1px solid #e4ddd0",borderRadius:10,padding:"8px 6px"};
const flagBox={background:"#f7ede4",border:"1px solid #a8613c",color:"#8a4a24",borderRadius:8,padding:"8px 10px",fontSize:13,fontWeight:600,margin:"4px 0"};
const tabBtn={flex:1,padding:"10px",borderRadius:10,border:"1px solid #e4ddd0",background:"#fff",fontWeight:700,fontSize:14,cursor:"pointer",color:"#8a8375"};
const tabActive={background:"#3b5b6b",color:"#fff",borderColor:"#3b5b6b"};
