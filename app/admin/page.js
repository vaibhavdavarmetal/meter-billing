"use client";
import { useState, useEffect, useCallback, useRef } from "react";

function money(n){ if(n==null||!isFinite(n)) return "—"; return "₹"+Math.round(n).toLocaleString("en-IN"); }
function thisPeriod(){ const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`; }
const MONTHS=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
function label(p){ const [y,m]=p.split("-").map(Number); return `${MONTHS[m-1]} ${y}`; }
function shiftPeriod(p,d){ let [y,m]=p.split("-").map(Number); m+=d; while(m<1){m+=12;y--;} while(m>12){m-=12;y++;} return `${y}-${String(m).padStart(2,"0")}`; }
function slugify(s){ return s.toLowerCase().trim().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,""); }
function monthsBetween(fromPeriod,toPeriod){
  const [fy,fm]=fromPeriod.split("-").map(Number);
  const [ty,tm]=toPeriod.split("-").map(Number);
  return (ty-fy)*12+(tm-fm);
}
// For a bi-monthly tenant: is this period a billing month (even offset from start) or a skip month?
function biMonthlyStatus(tenant,period){
  if(!tenant.biMonthly) return null;
  const start=tenant.biMonthlyStart||"2026-08";
  const diff=monthsBetween(start,period);
  if(diff<0) return null; // before their cycle begins
  return diff%2===0 ? "bill" : "skip";
}

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
  const [confirmUnpaid,setConfirmUnpaid]=useState(null); // {slug,pkey} pending unpaid confirmation
  const [paidAmt,setPaidAmt]=useState({}); // slug -> amount actually paid (string)
  const [reportBusy,setReportBusy]=useState(false);
  const [pendingStarts,setPendingStarts]=useState([]);
  const [startVals,setStartVals]=useState({});
  // Move-out (tenant-initiated)
  const [openMenu,setOpenMenu]=useState(null);           // slug whose ⋯ menu is open
  const [confirmMoveOut,setConfirmMoveOut]=useState(null); // {slug,name} pending confirm
  const [moveouts,setMoveouts]=useState([]);             // move-out requests
  const [settleSlug,setSettleSlug]=useState(null);
  const [settleInfo,setSettleInfo]=useState(null);
  const [settle,setSettle]=useState({moveOut:"",finalReading:"",rentAdj:"",misc:"",miscNote:"",deposit:"",carry:"",deductions:[]});
  const [settleMsg,setSettleMsg]=useState("");
  const [settleBusy,setSettleBusy]=useState(false);

  // Build a bill record for one tenant (used by manual save AND mark-paid auto-save)
  const buildBill=(pkey,prop,t,paidOverride)=>{
    const r=data.readings?data.readings[t.slug]:null;
    const saved=data.bills?data.bills[t.slug]:null;
    const ov=override[t.slug];
    // Priority: in-session edit → saved bill's reading → tenant's raw submission
    const eff= ov!==undefined&&ov!==""?Number(ov)
      : saved&&saved.currentReading!=null?saved.currentReading
      : (r?r.reading:null);
    const pv=Number(prev[t.slug]||0);
    const u= eff==null?0:Math.round(Math.max(0,eff-pv)*10)/10;
    const ex=extras[t.slug]||{};
    const rent=Number(ex.rent)||0, misc=Number(ex.misc)||0;
    const elec= eff==null?0: u*(Number(prop.rate)||0);
    const carry=Number((data.carryIn&&data.carryIn[t.slug])||0);
    const amount=Math.round(elec+rent+misc+carry);
    const pa= paidAmt[t.slug]!==undefined&&paidAmt[t.slug]!==""?Number(paidAmt[t.slug]):null;
    const outstanding= pa!=null? Math.round(amount-pa) : null;
    const paidFlag = paidOverride!==undefined ? paidOverride : !!ex.paid;
    return { slug:t.slug, propertyKey:pkey, previousReading:pv, currentReading:eff, units:u,
      electricity:Math.round(elec), rent, misc, carryIn:Math.round(carry), amount,
      paidAmount:pa, outstanding, paid:paidFlag, photoUrl:(r&&r.photoUrl)||(saved&&saved.photoUrl)||null };
  };

  // Save one tenant's bill to history; optionally set paid explicitly.
  const saveOneBill=async(pkey,prop,t,paidOverride)=>{
    const bill=buildBill(pkey,prop,t,paidOverride);
    try{ await fetch("/api/readings",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"save-bill",pw,period,bills:[bill]})}); }catch{}
    return bill;
  };

  const [reg,setReg]=useState(null);
  const [startInput,setStartInput]=useState({});
  const [regMsg,setRegMsg]=useState("");

  // house help
  const [staff,setStaff]=useState(null);
  const [staffEntries,setStaffEntries]=useState({});
  const [staffCarry,setStaffCarry]=useState({});
  const [staffPaid,setStaffPaid]=useState({});
  const [staffMsg,setStaffMsg]=useState("");

  const [theme,setTheme]=useState("dark"); // dark by default
  const [photoView,setPhotoView]=useState(null); // url of photo to preview full-screen
  const [prevUnlocked,setPrevUnlocked]=useState({}); // slug -> true to allow editing previous reading
  const [expandedTenant,setExpandedTenant]=useState({}); // slug -> true when accordion open
  const [agrBusy,setAgrBusy]=useState({}); // slug -> true while uploading agreement

  useEffect(()=>{
    try{ const t=window.localStorage.getItem("admin-theme"); if(t) setTheme(t); }catch{}
  },[]);
  const toggleTheme=()=>{ const t=theme==="dark"?"light":"dark"; setTheme(t); try{ window.localStorage.setItem("admin-theme",t); }catch{} };

  const fetchPeriod=useCallback(async(p,password)=>{
    setLoading(true); setErr("");
    try{
      const res=await fetch(`/api/readings?period=${p}&pw=${encodeURIComponent(password)}`);
      if(res.status===401){ setErr("Wrong password."); setLoading(false); return false; }
      if(!res.ok) throw new Error();
      const d=await res.json();
      setData(d);
      const sp={}; Object.entries(d.autoPrevious||{}).forEach(([s,v])=>{ if(v!=null) sp[s]=String(v); });
      // A saved bill's previous reading is authoritative
      Object.entries(d.bills||{}).forEach(([s,b])=>{ if(b&&b.previousReading!=null) sp[s]=String(b.previousReading); });
      // approvals restore previous/current too
      const ap={};
      Object.entries(d.approvals||{}).forEach(([s,v])=>{ if(v&&v.approved){ ap[s]=true; if(v.previousReading!=null) sp[s]=String(v.previousReading); } });
      // A saved (unpaid) bill means it was approved — restore that state
      Object.entries(d.bills||{}).forEach(([s,b])=>{ if(b) ap[s]=true; });
      setPrev(sp); setApproved(ap);
      const ex={};
      Object.entries(d.properties).forEach(([pk,prop])=>{
        prop.tenants.forEach((t)=>{
          const e=d.extras&&d.extras[t.slug];
          const b=d.bills&&d.bills[t.slug];
          ex[t.slug]={
            rent: e&&e.rent!=null?String(e.rent):(t.rent?String(t.rent):""),
            misc: e&&e.misc!=null?String(e.misc):(t.misc?String(t.misc):""),
            miscNote: e?(e.miscNote||""):"",
            // The saved bill's paid flag is authoritative; fall back to extras
            paid: b&&typeof b.paid==="boolean"?b.paid:(e?!!e.paid:false),
          };
        });
      });
      setExtras(ex); setOverride({}); setSavedMsg(""); setLoading(false); return true;
    }catch{ setErr("Could not load."); setLoading(false); return false; }
  },[]);

  const login=async()=>{ const ok=await fetchPeriod(period,pw); if(ok){ setAuthed(true); loadMoveouts(pw); } };
  const changeMonth=async(d)=>{ const p=shiftPeriod(period,d); setPeriod(p); await fetchPeriod(p,pw); };

  const loadRegistry=async()=>{
    setRegMsg("");
    try{ const res=await fetch(`/api/registry?pw=${encodeURIComponent(pw)}`); if(!res.ok) throw new Error(); const d=await res.json(); setReg(d.properties); }
    catch{ setRegMsg("Could not load tenant list."); }
  };
  const openManage=async()=>{ setView("manage"); if(!reg) await loadRegistry(); loadPendingStarts(); };

  const uploadAgreement=async(slug,file)=>{
    if(!file) return;
    setAgrBusy(b=>({...b,[slug]:true}));
    try{
      const dataUrl=await new Promise((res,rej)=>{ const r=new FileReader(); r.onload=()=>res(r.result); r.onerror=rej; r.readAsDataURL(file); });
      const base64=String(dataUrl).split(",")[1];
      const resp=await fetch("/api/agreement",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({pw,slug,fileBase64:base64,mediaType:file.type,filename:file.name})});
      const d=await resp.json();
      if(!resp.ok){ alert(d.error||"Upload failed"); }
      else { await loadRegistry(); }
    }catch{ alert("Upload failed."); }
    setAgrBusy(b=>({...b,[slug]:false}));
  };

  const loadPendingStarts=async()=>{
    try{
      const res=await fetch(`/api/settlement?pending=1&pw=${encodeURIComponent(pw)}`);
      if(!res.ok) return;
      const d=await res.json();
      setPendingStarts(d.pending||[]);
      const v={}; (d.pending||[]).forEach(p=>{ v[p.slug]=String(p.reading??""); }); setStartVals(v);
    }catch{}
  };
  const confirmStart=async(slug)=>{
    const reading=Number(startVals[slug]);
    if(!reading&&reading!==0){ return; }
    if(!window.confirm(`Set ${reading} as the starting meter reading? Future bills are measured from this.`)) return;
    try{
      const res=await fetch("/api/readings",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"confirm-start",pw,slug,reading})});
      if(!res.ok) throw new Error();
      await loadPendingStarts();
    }catch{}
  };

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

  // ── Move-out (tenant-initiated) ──
  const loadMoveouts=async(password=pw)=>{
    try{ const r=await fetch(`/api/settlement?moveouts=1&pw=${encodeURIComponent(password)}`); if(!r.ok) return; const d=await r.json(); setMoveouts(d.moveouts||[]); }catch{}
  };
  const startMoveOut=async(slug)=>{
    setConfirmMoveOut(null); setOpenMenu(null);
    try{ await fetch("/api/readings",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"start-moveout",pw,slug})}); }catch{}
    await loadMoveouts();
  };
  const cancelMoveOut=async(slug)=>{
    try{ await fetch("/api/readings",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"cancel-moveout",pw,slug})}); }catch{}
    await loadMoveouts();
  };
  const openSettlement=async(slug)=>{
    setView("settlement"); setSettleSlug(slug); setSettleMsg(""); setSettleInfo(null);
    try{
      const r=await fetch(`/api/settlement?t=${encodeURIComponent(slug)}&pw=${encodeURIComponent(pw)}`);
      if(!r.ok){ setSettleMsg("Could not load tenant."); return; }
      const d=await r.json(); setSettleInfo(d);
      const st=d.settlement||{};
      setSettle({
        moveOut: st.moveOut||"",
        finalReading: st.finalReading!=null?String(st.finalReading):(d.finalReading!=null?String(d.finalReading):(d.pendingReading!=null?String(d.pendingReading):"")),
        rentAdj: st.rentAdj!=null?String(st.rentAdj):"",
        misc: st.misc!=null?String(st.misc):"",
        miscNote: st.miscNote||"",
        deposit: st.deposit!=null?String(st.deposit):(d.rent?String(d.rent):""),
        carry: st.carry!=null?String(st.carry):"",
        deductions: st.deductions||[],
      });
    }catch{ setSettleMsg("Could not load tenant."); }
  };
  const setSF=(f,v)=> setSettle(p=>({...p,[f]:v}));

  // ⋯ per-tenant actions menu (currently: Start move-out, with confirmation)
  const MoreMenu=({slug,name})=>(
    <div style={{position:"relative"}}>
      <button onClick={(e)=>{ e.stopPropagation(); setOpenMenu(openMenu===slug?null:slug); }} aria-label="More actions" style={{border:"1px solid var(--line)",background:"var(--field)",color:"var(--muted)",borderRadius:8,width:32,height:32,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.6"></circle><circle cx="12" cy="12" r="1.6"></circle><circle cx="19" cy="12" r="1.6"></circle></svg>
      </button>
      {openMenu===slug&&(
        <div style={{position:"absolute",right:0,top:36,zIndex:30,minWidth:180,background:"var(--card)",border:"1px solid var(--line)",borderRadius:10,boxShadow:"var(--shadow)",overflow:"hidden"}} onClick={(e)=>e.stopPropagation()}>
          <button onClick={()=>{ setOpenMenu(null); setConfirmMoveOut({slug,name}); }} style={{display:"flex",alignItems:"center",gap:9,width:"100%",textAlign:"left",padding:"11px 13px",background:"transparent",border:"none",color:"var(--ink)",fontSize:13,fontWeight:500,cursor:"pointer"}}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><path d="m16 17 5-5-5-5"></path><path d="M21 12H9"></path></svg>
            Start move-out
          </button>
        </div>
      )}
    </div>
  );

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
    if(!staff) return <p style={{color:"var(--muted)"}}>{staffMsg||"Loading house help…"}</p>;
    const addStaff=async()=>{ const list=[...(staff||[]),{id:"",name:"New helper",salary:0}]; await saveStaffList(list); await loadStaff(); };
    const removeStaff=async(id)=>{ if(!window.confirm("Remove this helper? Past records stay saved.")) return; const list=(staff||[]).filter(s=>s.id!==id); await saveStaffList(list); await loadStaff(); };
    const renameStaff=(id,field,val)=> setStaff(staff.map(s=>s.id===id?{...s,[field]:val}:s));
    return (
      <>
        <p style={{fontSize:13,color:"var(--muted)"}}>Track monthly pay for house help. Salary + extra − deduction + last month's balance = amount due. Enter what you actually paid; any difference carries to next month.</p>
        {staff.length===0&&<p style={{fontSize:14,color:"var(--muted)"}}>No house help added yet.</p>}
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
                <button onClick={()=>removeStaff(s.id)} style={{...btn,background:"var(--card)",color:"#e5484d",border:"1px solid var(--line)",width:"auto",padding:"10px 12px",marginTop:0}}>Remove</button>
              </div>
              {carry!==0&&<div style={{fontSize:13,marginBottom:8,color:carry>0?"var(--accent)":"var(--good)"}}>{carry>0?`Owed from last month: +${money(carry)}`:`Advance from last month: ${money(carry)}`}</div>}
              <div style={{display:"flex",gap:8}}>
                <div style={{flex:1}}><label style={lblSm}>Salary ₹</label><input inputMode="numeric" value={e.salary} onChange={ev=>setStaffField(s.id,"salary",ev.target.value.replace(/[^0-9.]/g,""))} style={inpSm} placeholder="0"/></div>
                <div style={{flex:1}}><label style={lblSm}>Extra ₹</label><input inputMode="numeric" value={e.extra} onChange={ev=>setStaffField(s.id,"extra",ev.target.value.replace(/[^0-9.]/g,""))} style={inpSm} placeholder="0"/></div>
                <div style={{flex:1}}><label style={lblSm}>Deduct ₹</label><input inputMode="numeric" value={e.deduction} onChange={ev=>setStaffField(s.id,"deduction",ev.target.value.replace(/[^0-9.]/g,""))} style={inpSm} placeholder="0"/></div>
              </div>
              <input value={e.extraNote} onChange={ev=>setStaffField(s.id,"extraNote",ev.target.value)} style={{...inpSm,marginTop:6}} placeholder="Note for extra/advance (optional)"/>
              <input value={e.deductionNote} onChange={ev=>setStaffField(s.id,"deductionNote",ev.target.value)} style={{...inpSm,marginTop:6}} placeholder="Note for deduction (optional)"/>
              <div style={{fontSize:14,margin:"10px 0 8px"}}>Amount due: <strong>{money(due)}</strong> <span style={{fontSize:12,color:"var(--muted)"}}>(salary {money(salary)}{extra?` + extra ${money(extra)}`:""}{deduction?` − deduct ${money(deduction)}`:""}{carry?` ${carry>0?"+":"−"} bal ${money(Math.abs(carry))}`:""})</span></div>
              <label style={lblSm}>Amount actually paid ₹</label>
              <input inputMode="numeric" value={staffPaid[s.id]??""} onChange={ev=>setStaffPaid({...staffPaid,[s.id]:ev.target.value.replace(/[^0-9.]/g,"")})} style={inpSm} placeholder={String(Math.round(due))}/>
              {pa!=null&&<div style={{fontSize:12,marginTop:4,color:out>0?"var(--accent)":out<0?"var(--good)":"var(--muted)"}}>{out>0?`Short ${money(out)} — carries to next month`:out<0?`Paid extra ${money(-out)} — advance next month`:"Settled exactly"}</div>}
              <div style={{display:"flex",gap:8,alignItems:"center",marginTop:12}}>
                <button onClick={()=>saveStaffEntry(s)} style={{...btn,background:"var(--slate)",marginTop:0}}>Save {label(period)}</button>
                <div style={{marginLeft:"auto"}}><button type="button" onClick={()=>setStaffField(s.id,"paid",!e.paid)} style={{border:"1px solid var(--line)",background:e.paid?"var(--good)":"var(--field)",color:e.paid?"#fff":"var(--muted)",borderRadius:20,padding:"7px 16px",fontSize:13,fontWeight:600,cursor:"pointer"}}>{e.paid?"✓ Paid":"Mark paid"}</button></div>
              </div>
            </div>
          );
        })}
        <button onClick={addStaff} style={{...btn,background:"var(--accent-weak)",color:"var(--slate)",marginTop:12}}>+ Add house help</button>
        {staffMsg&&<p style={{fontSize:13,color:staffMsg.startsWith("Saved")?"var(--good)":"#e5484d",textAlign:"center",marginTop:8}}>{staffMsg}</p>}
      </>
    );
  };

  const setExtra=(slug,f,v)=> setExtras(p=>({...p,[slug]:{...p[slug],[f]:v}}));
  const persistExtra=async(slug)=>{ const e=extras[slug]; if(!e) return; try{ await fetch("/api/readings",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"save-extras",pw,period,slug,extras:e})}); }catch{} };

  const persistApproval=async(slug,isApproved,prevV,currV)=>{
    try{ await fetch("/api/readings",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"save-approval",pw,period,slug,approval:isApproved,previousReading:prevV,currentReading:currV})}); }catch{}
  };

  const doApprove=(slug,prevV,currV)=>{
    setApproved(a=>({...a,[slug]:true}));
    persistApproval(slug,true,prevV,currV);
    // Also save the full bill immediately so edits survive a refresh
    for(const [pkey,prop] of Object.entries(data.properties)){
      const t=prop.tenants.find(x=>x.slug===slug);
      if(t){ saveOneBill(pkey,prop,t); break; }
    }
    setConfirmSlug(null);
  };
  const unApprove=(slug)=>{ setApproved(a=>({...a,[slug]:false})); persistApproval(slug,false); };

  const resetSubmission=async(slug)=>{
    if(!window.confirm("Unlock this tenant so they can submit a new photo for "+label(period)+"? The current reading stays visible to you until they resubmit.")) return;
    try{
      await fetch("/api/readings",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"reset-submission",pw,period,slug})});
      await fetchPeriod(period,pw);
    }catch{}
  };

  const waText=(propName,tName,parts,total,meter)=>{
    let s=`Bill — ${label(period)}\n${propName} · ${tName}\n\n`;
    if(meter&&meter.current!=null){
      s+=`Meter previous: ${meter.previous}\nMeter current: ${meter.current}\nUnits used: ${meter.units}\n\n`;
    }
    parts.forEach(p=>{ s+=`${p.label}: ${money(p.amount)}\n`; });
    s+=`\nTotal payable: ${money(total)}`; return s;
  };

  // Build a WhatsApp URL — direct to the tenant's number if we have it, else contact-picker.
  const waUrl=(phone,text)=>{
    const clean=(phone||"").replace(/[^0-9]/g,"");
    return clean ? `https://wa.me/${clean}?text=${encodeURIComponent(text)}` : `https://wa.me/?text=${encodeURIComponent(text)}`;
  };
  const reminderText=(tName)=>`Namaste ${tName} 🙏\nReminder: please send your electricity meter reading for ${billLabel()} using your personal link. It takes less than a minute. Thank you!`;
  function billLabel(){ // the month tenants are reading FOR (previous month)
    const p=shiftPeriod(thisPeriod(),-1); return label(p);
  }

  // Build the full welcome message for a tenant, including their real link.
  const tenantLink=(slug)=>{
    const base = typeof window!=="undefined" ? window.location.origin : "";
    return `${base}/?t=${slug}`;
  };
  const welcomeText=(tName,slug)=>{
    const link=tenantLink(slug);
    return `Namaste ${tName} 🙏\n\nFrom this month onwards, please send your electricity meter reading yourself through this link — it takes less than a minute each month.\n\nYour personal link:\n${link}\n\nPlease send your reading in the first week of every month.\n\nHow to use:\n1. Open the link\n2. Tap "Take a photo of your meter" and photograph it clearly\n3. Check the reading matches your meter, correct if needed\n4. Tap Submit\n\nPlease double-check before submitting — you can only submit once each month.\n\nTo save the link on your phone:\nAndroid (Chrome): open link → tap ⋮ (top right) → Add to Home screen\niPhone (Safari): open link → tap Share → Add to Home Screen\n\nAny trouble, message me. Thank you! 🙏`;
  };

  if(!authed){
    const tv = theme==="dark"
      ? { "--paper":"#0a0a0a","--card":"#111111","--elev":"#161616","--ink":"#ededed","--muted":"#a1a1a1","--faint":"#737373","--line":"#262626","--hair":"#1f1f1f","--field":"#0d0d0d","--slate":"#6aa8ff","--accent":"#e5a13a","--good":"#4cc38a","--good-bg":"#0e1f16","--good-line":"#1d4030","--warn-bg":"#211803","--warn-line":"#433310","--accent-weak":"#0d1220","--primary-bg":"#ffffff","--primary-fg":"#0a0a0a","--shadow":"0 1px 2px rgba(0,0,0,0.4)" }
      : { "--paper":"#fafafa","--card":"#ffffff","--elev":"#f6f6f6","--ink":"#0a0a0a","--muted":"#666666","--faint":"#8f8f8f","--line":"#eaeaea","--hair":"#f2f2f2","--field":"#fafafa","--slate":"#0068d6","--accent":"#b45309","--good":"#0f7b34","--good-bg":"#edf7f0","--good-line":"#c6e5cf","--warn-bg":"#fff8eb","--warn-line":"#f5e0b3","--accent-weak":"#f4f9ff","--primary-bg":"#0a0a0a","--primary-fg":"#ffffff","--shadow":"0 1px 2px rgba(0,0,0,0.04)" };
    return (
      <div style={{...tv,background:"var(--paper)",minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
        <div style={{width:"100%",maxWidth:340,background:"var(--card)",border:"1px solid var(--line)",borderRadius:16,padding:24,color:"var(--ink)"}}>
          <div style={{display:"flex",justifyContent:"center",marginBottom:16}}>
            <img src="/admin-logo.png" alt="" style={{width:96,height:96,borderRadius:"50%",objectFit:"cover",border:"2px solid var(--line)"}}/>
          </div>
          <div style={{fontSize:11,letterSpacing:2,textTransform:"uppercase",color:"var(--accent)",fontWeight:700,textAlign:"center"}}>Rent and electricity management</div>
          <h1 style={{fontFamily:"'Geist', ui-sans-serif, system-ui, sans-serif",fontSize:24,margin:"4px 0 18px",color:"var(--ink)",textAlign:"center"}}>Home admin sign in</h1>
          <label style={lbl}>Password</label>
          <input type="password" value={pw} onChange={e=>setPw(e.target.value)} onKeyDown={e=>e.key==="Enter"&&login()} style={inp} placeholder="Enter admin password" autoFocus/>
          {err&&<p style={{color:"#e5484d",fontSize:14}}>{err}</p>}
          <button onClick={login} style={btn} disabled={loading}>{loading?"Checking…":"Sign in"}</button>
        </div>
      </div>
    );
  }

  // ── MANAGE ──
  const renderManage=()=>{
    if(!reg) return <p style={{color:"var(--muted)"}}>{regMsg||"Loading tenants…"}</p>;
    const setProp=(pk,f,v)=>setReg({...reg,[pk]:{...reg[pk],[f]:v}});
    const setTen=(pk,i,f,v)=>{ const n=structuredClone(reg); n[pk].tenants[i][f]=v; setReg(n); };
    const addTen=(pk)=>{ const n=structuredClone(reg); n[pk].tenants.push({slug:pk+"-"+(n[pk].tenants.length+1),name:"New Tenant",rent:0,misc:0}); setReg(n); };
    const removeTen=(pk,i)=>{ const t=reg[pk].tenants[i]; if(!window.confirm(`Remove ${t.name||"this tenant"}? This removes them from the list. Past bills and readings stay saved. You can re-add them later.`)) return; const n=structuredClone(reg); n[pk].tenants.splice(i,1); setReg(n); };
    const setContact=(pk,ci,f,v)=>{ const n=structuredClone(reg); if(!n[pk].contacts) n[pk].contacts=[]; n[pk].contacts[ci][f]=v; setReg(n); };
    const addContact=(pk)=>{ const n=structuredClone(reg); if(!n[pk].contacts) n[pk].contacts=[]; n[pk].contacts.push({label:"",name:"",phone:""}); setReg(n); };
    const removeContact=(pk,ci)=>{ const c=reg[pk].contacts[ci]; if(!window.confirm(`Remove ${c.name||"this contact"}${c.label?` (${c.label})`:""}?`)) return; const n=structuredClone(reg); n[pk].contacts.splice(ci,1); setReg(n); };
    const save=async()=>{
      setRegMsg("");
      const fixed=structuredClone(reg);
      Object.values(fixed).forEach(p=>{ p.rate=Number(p.rate)||0; p.tenants.forEach(t=>{ if(!t.slug) t.slug=slugify(t.name); t.rent=Number(t.rent)||0; t.misc=Number(t.misc)||0; t.startReading=Number(t.startReading)||0; t.biMonthly=!!t.biMonthly; if(t.biMonthly&&!t.biMonthlyStart) t.biMonthlyStart="2026-08"; t.phone=(t.phone||"").replace(/[^0-9]/g,""); if(t.active===undefined) t.active=true; }); });
      try{
        const res=await fetch("/api/registry",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({pw,properties:fixed})});
        const d=await res.json();
        if(!res.ok){ setRegMsg(d.error||"Could not save."); return; }
        setReg(fixed); setRegMsg("Saved. Changes are live.");
      }catch{ setRegMsg("Could not save."); }
    };
    return (
      <div>
        <p style={{fontSize:13,color:"var(--muted)"}}>Edit names, the per-unit rate, default rent, and default misc for each tenant. Defaults auto-fill billing each month; you can still override misc there. Changes go live after you save.</p>
        <a href="/admin/close-out" style={{display:"block",textAlign:"center",background:"var(--field)",color:"var(--slate)",border:"1px solid var(--line)",borderRadius:11,padding:"11px",fontWeight:600,fontSize:14,textDecoration:"none",marginBottom:4}}>→ Close out a tenant (final settlement)</a>
        {pendingStarts.length>0&&(
          <div style={{background:"var(--card)",border:"1px solid var(--accent)",borderRadius:14,padding:14,marginBottom:12}}>
            <div style={{fontSize:12,fontWeight:700,color:"var(--accent)",textTransform:"uppercase",letterSpacing:.5,marginBottom:8}}>Move-in readings to verify</div>
            {pendingStarts.map(p=>(
              <div key={p.slug} style={{borderTop:"1px solid var(--line)",paddingTop:10,marginTop:10}}>
                <div style={{fontWeight:700,fontSize:14}}>{p.name} <span style={{color:"var(--muted)",fontWeight:400}}>· {p.propertyName}</span></div>
                <div style={{fontSize:13,color:"var(--muted)",marginTop:2}}>Tenant submitted: <b style={{color:"var(--slate)"}}>{p.reading}</b></div>
                {p.photoUrl&&<a href={p.photoUrl} target="_blank" rel="noopener noreferrer" style={{display:"inline-block",marginTop:6}}><img src={p.photoUrl} alt="meter" style={{maxWidth:140,borderRadius:8,border:"1px solid var(--line)"}}/></a>}
                <div style={{display:"flex",gap:6,marginTop:8,alignItems:"center"}}>
                  <label style={{fontSize:12,color:"var(--muted)"}}>Confirm reading</label>
                  <input inputMode="numeric" value={startVals[p.slug]??""} onChange={e=>setStartVals({...startVals,[p.slug]:e.target.value.replace(/[^0-9.]/g,"")})} style={{...inpSm,width:110}}/>
                  <button onClick={()=>confirmStart(p.slug)} style={{...btn,width:"auto",padding:"9px 14px",marginTop:0,background:"var(--good)"}}>Confirm</button>
                </div>
              </div>
            ))}
          </div>
        )}
        {Object.entries(reg).map(([pk,prop])=>(
          <div key={pk} style={{marginTop:18}}>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
              <input value={prop.name} onChange={e=>setProp(pk,"name",e.target.value)} style={{...inp,fontWeight:700,flex:1}}/>
              <div style={{display:"flex",alignItems:"center",gap:4}}>
                <span style={{fontSize:12,color:"var(--muted)"}}>₹/unit</span>
                <input inputMode="decimal" value={prop.rate??""} onChange={e=>setProp(pk,"rate",e.target.value.replace(/[^0-9.]/g,""))} style={{...inpSm,width:64}}/>
              </div>
            </div>
            {prop.tenants.map((t,i)=>(
              <div key={i} style={{...card,padding:0,overflow:"hidden"}}>
                <button type="button" onClick={()=>setExpandedTenant(x=>({...x,[t.slug]:!x[t.slug]}))} style={{width:"100%",display:"flex",alignItems:"center",gap:8,padding:"14px 14px",background:"transparent",border:"none",cursor:"pointer",color:"var(--ink)"}}>
                  <span style={{fontWeight:700,fontSize:15,flex:1,textAlign:"left",color:t.active===false?"var(--muted)":"var(--ink)"}}>{t.name||"(unnamed)"}{t.active===false?" (inactive)":""}</span>
                  {t.agreementUrl&&<span title="Agreement on file" style={{fontSize:13}}>📄</span>}
                  <span style={{fontSize:12,color:"var(--muted)"}}>{t.rent?`₹${Number(t.rent).toLocaleString("en-IN")}`:""}</span>
                  <span style={{fontSize:14,color:"var(--slate)",transform:expandedTenant[t.slug]?"rotate(180deg)":"none",transition:"transform .15s"}}>▾</span>
                </button>
                {expandedTenant[t.slug]&&(
                <div style={{padding:"0 12px 12px"}}>
                <div style={{display:"flex",gap:8,marginBottom:6}}>
                  <div style={{flex:1}}><label style={lblSm}>Name</label><input value={t.name} onChange={e=>setTen(pk,i,"name",e.target.value)} style={inpSm}/></div>
                  <div style={{width:84}}><label style={lblSm}>Rent ₹</label><input inputMode="numeric" value={t.rent??""} onChange={e=>setTen(pk,i,"rent",e.target.value.replace(/[^0-9.]/g,""))} style={inpSm}/></div>
                  <div style={{width:84}}><label style={lblSm}>Misc ₹</label><input inputMode="numeric" value={t.misc??""} onChange={e=>setTen(pk,i,"misc",e.target.value.replace(/[^0-9.]/g,""))} style={inpSm}/></div>
                </div>
                <div style={{marginBottom:6}}>
                  <label style={lblSm}>WhatsApp number (with country code, e.g. 919812345678)</label>
                  <input inputMode="tel" value={t.phone||""} onChange={e=>setTen(pk,i,"phone",e.target.value.replace(/[^0-9]/g,""))} style={inpSm} placeholder="91XXXXXXXXXX"/>
                </div>
                <div style={{display:"flex",gap:8,alignItems:"flex-end"}}>
                  <div style={{flex:1}}><label style={lblSm}>Link id (slug)</label><input value={t.slug} onChange={e=>setTen(pk,i,"slug",e.target.value.replace(/[^a-z0-9-]/g,""))} style={{...inpSm,fontFamily:"monospace"}}/></div>
                  <div style={{width:110}}><label style={lblSm}>July start reading</label><input inputMode="numeric" value={t.startReading??""} onChange={e=>setTen(pk,i,"startReading",e.target.value.replace(/[^0-9.]/g,""))} style={inpSm} placeholder="from diary"/></div>
                  <div style={{width:140}}><label style={lblSm}>Move-in date (optional)</label><input type="date" value={t.moveIn||""} onChange={e=>setTen(pk,i,"moveIn",e.target.value)} style={inpSm}/></div>
                  {!prop.isTest&&<button onClick={()=>removeTen(pk,i)} style={{...btn,background:"var(--card)",color:"#e5484d",border:"1px solid var(--line)",width:"auto",padding:"10px 12px",marginTop:0}}>Remove</button>}
                </div>
                {!prop.isTest&&(
                  <label style={{display:"flex",alignItems:"center",gap:8,marginTop:8,fontSize:13,color:"var(--slate)",cursor:"pointer"}}>
                    <input type="checkbox" checked={!!t.biMonthly} onChange={e=>setTen(pk,i,"biMonthly",e.target.checked)}/>
                    Electricity billed every 2 months (bi-monthly)
                  </label>
                )}
                {t.biMonthly&&(
                  <div style={{marginTop:6}}>
                    <label style={lblSm}>First billing month (YYYY-MM)</label>
                    <input value={t.biMonthlyStart||"2026-08"} onChange={e=>setTen(pk,i,"biMonthlyStart",e.target.value)} style={{...inpSm,width:130}} placeholder="2026-08"/>
                  </div>
                )}
                {!prop.isTest&&(
                  <div style={{display:"flex",gap:8,marginTop:12}}>
                    <a href={waUrl(t.phone,welcomeText(t.name,t.slug))} target="_blank" rel="noreferrer" style={{flex:1,textAlign:"center",background:"transparent",color:"var(--good)",border:"1px solid var(--good)",textDecoration:"none",borderRadius:8,padding:"10px",fontSize:13,fontWeight:700}}>
                      Send link{t.phone?"":" (pick contact)"}
                    </a>
                    <button type="button" onClick={()=>setTen(pk,i,"active",t.active===false?true:false)} style={{background:t.active===false?"var(--accent)":"var(--field)",color:t.active===false?"#fff":"var(--muted)",border:"1px solid var(--line)",borderRadius:8,padding:"10px 14px",fontSize:13,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap"}}>
                      {t.active===false?"Inactive — reactivate":"Deactivate link"}
                    </button>
                  </div>
                )}
                {t.active===false&&<p style={{fontSize:12,color:"var(--accent)",marginTop:6,fontWeight:600}}>This tenant's link is blocked. Remember to Save changes.</p>}
                {!prop.isTest&&(
                  <div style={{marginTop:12,paddingTop:12,borderTop:"1px solid var(--line)"}}>
                    <label style={lblSm}>Rental agreement</label>
                    {t.agreementUrl?(
                      <div style={{display:"flex",alignItems:"center",gap:8,marginTop:4}}>
                        <a href={t.agreementUrl} target="_blank" rel="noreferrer" style={{flex:1,color:"var(--slate)",fontSize:13,textDecoration:"none",fontWeight:600}}>📄 View / download {t.agreementName||"agreement"}</a>
                        <label style={{...btn,background:"var(--field)",color:"var(--slate)",border:"1px solid var(--line)",width:"auto",padding:"8px 12px",marginTop:0,cursor:"pointer",fontSize:12}}>
                          {agrBusy[t.slug]?"Uploading…":"Replace"}
                          <input type="file" accept="application/pdf,image/*" onChange={e=>uploadAgreement(t.slug,e.target.files?.[0])} style={{display:"none"}}/>
                        </label>
                      </div>
                    ):(
                      <label style={{...btn,background:"var(--field)",color:"var(--slate)",border:"1px solid var(--line)",marginTop:4,cursor:"pointer",display:"block",textAlign:"center"}}>
                        {agrBusy[t.slug]?"Uploading…":"⬆ Upload agreement (PDF or photo)"}
                        <input type="file" accept="application/pdf,image/*" onChange={e=>uploadAgreement(t.slug,e.target.files?.[0])} style={{display:"none"}}/>
                      </label>
                    )}
                    <p style={{fontSize:11,color:"var(--muted)",marginTop:4}}>Max ~4MB. Stored securely; one per tenant.</p>
                  </div>
                )}
                </div>
                )}
              </div>
            ))}
            {!prop.isTest&&<button onClick={()=>addTen(pk)} style={{...btn,background:"var(--accent-weak)",color:"var(--slate)",marginTop:8}}>+ Add tenant to {prop.name}</button>}

            {!prop.isTest&&(
              <div style={{marginTop:14,paddingTop:14,borderTop:"1px solid var(--line)"}}>
                <div style={{fontSize:12,fontWeight:700,color:"var(--muted)",textTransform:"uppercase",letterSpacing:.5,marginBottom:8}}>Maintenance contacts · {prop.name}</div>
                {(prop.contacts||[]).map((c,ci)=>(
                  <div key={ci} style={{display:"flex",gap:6,marginBottom:6}}>
                    <input value={c.label||""} onChange={e=>setContact(pk,ci,"label",e.target.value)} style={{...inpSm,width:90}} placeholder="Role"/>
                    <input value={c.name||""} onChange={e=>setContact(pk,ci,"name",e.target.value)} style={{...inpSm,flex:1}} placeholder="Name"/>
                    <input inputMode="tel" value={c.phone||""} onChange={e=>setContact(pk,ci,"phone",e.target.value.replace(/[^0-9]/g,""))} style={{...inpSm,width:110}} placeholder="Phone"/>
                    <button onClick={()=>removeContact(pk,ci)} style={{border:"1px solid var(--line)",background:"var(--field)",color:"#e5484d",borderRadius:8,padding:"0 10px",cursor:"pointer"}}>✕</button>
                  </div>
                ))}
                <button onClick={()=>addContact(pk)} style={{...btn,background:"var(--field)",color:"var(--slate)",border:"1px solid var(--line)",marginTop:4,padding:"8px"}}>+ Add contact (plumber, electrician, cleaner…)</button>
              </div>
            )}
          </div>
        ))}
        <button onClick={save} style={{...btn,background:"var(--ink)",marginTop:20}}>Save changes</button>
        {regMsg&&<p style={{fontSize:13,color:regMsg.startsWith("Saved")?"var(--good)":"#e5484d",textAlign:"center",marginTop:8}}>{regMsg}</p>}
      </div>
    );
  };

  // ── BILLING ──
  const renderBilling=()=>{
    return (
    <>
      {loading&&<p style={{color:"var(--muted)"}}>Loading {label(period)}…</p>}

      {moveouts.length>0&&moveouts.map((mo)=>(
        <div key={mo.slug} style={{border:"1px solid var(--warn-line)",borderRadius:12,background:"var(--warn-bg)",padding:14,marginTop:16,display:"flex",flexDirection:"column",gap:10}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><path d="m16 17 5-5-5-5"></path><path d="M21 12H9"></path></svg>
            <div style={{fontSize:14,fontWeight:600,color:"var(--ink)"}}>{mo.name} {mo.finalSubmitted?"wants to move out":"is moving out"}</div>
          </div>
          <div style={{fontSize:13,color:"var(--accent)",lineHeight:1.5}}>
            {mo.finalSubmitted
              ? <>Final reading <b>{mo.finalReading}</b> submitted{mo.submittedAt?` on ${new Date(mo.submittedAt).toLocaleDateString("en-IN")}`:""}. Settle here — no separate sign-in.</>
              : <>Move-out started. Waiting for {mo.name} to submit their final reading on move-out day.</>}
          </div>
          <div style={{display:"flex",gap:8}}>
            {mo.finalSubmitted&&<button onClick={()=>openSettlement(mo.slug)} style={{...btn,background:"var(--ink)",color:"var(--paper)",width:"auto",padding:"10px 16px",marginTop:0}}>Start settlement</button>}
            <button onClick={()=>cancelMoveOut(mo.slug)} style={{...btn,background:"var(--card)",color:"var(--muted)",border:"1px solid var(--line)",width:"auto",padding:"10px 14px",marginTop:0}}>Cancel move-out</button>
          </div>
        </div>
      ))}
      {data&&Object.entries(data.properties).map(([pkey,prop])=>(
        <div key={pkey} style={{marginTop:20}}>
          <h2 style={{fontSize:17,display:"flex",alignItems:"center",gap:8}}>
            {prop.name}
            {prop.isTest&&<span style={{fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:.5,color:"var(--accent)",background:"var(--warn-bg)",border:"1px solid var(--accent)",borderRadius:6,padding:"2px 8px"}}>practice</span>}
          </h2>
          {prop.isTest&&<p style={{fontSize:12,color:"var(--muted)",margin:"0 0 4px"}}>Safe to experiment — never affects real bills.</p>}
          {prop.tenants.map((t)=>{
            const saved=data.bills?data.bills[t.slug]:null;
            const r=data.readings?data.readings[t.slug]:null;
            const submitted=r?r.reading:null;
            const ai=r&&r.aiReading!=null?r.aiReading:null;
            const isApproved=!!approved[t.slug];
            const ov=override[t.slug];
            const effective= ov!==undefined&&ov!==""?Number(ov): saved&&saved.currentReading!=null?saved.currentReading: submitted!=null?submitted: null;
            const prevV=Number(prev[t.slug]||0);
            const unitsRaw=effective==null?null:Math.max(0,effective-prevV);
            const units=unitsRaw==null?null:Math.round(unitsRaw*10)/10;
            const mismatch=ai!=null&&submitted!=null&&Number(ai)!==Number(submitted);
            const photoUrl=r?.photoUrl||saved?.photoUrl;
            const hasReading=!!r;
            const ex=extras[t.slug]||{rent:"",misc:"",miscNote:"",paid:false};
            const rent=Number(ex.rent)||0, misc=Number(ex.misc)||0;
            const carry=Number((data.carryIn&&data.carryIn[t.slug])||0);
            const elec= effective==null?null: units*(Number(prop.rate)||0);
            const total= elec==null?null: elec+rent+misc+carry;
            const biStatus=biMonthlyStatus(t,period);

            if(saved && ex.paid){
              return (
                <div key={t.slug} style={{...card,borderColor:"var(--good-line)"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8}}>
                    <strong>{t.name}</strong>
                    <div style={{display:"flex",alignItems:"center",gap:8}}>
                      <span style={{fontFamily:"'Geist', ui-sans-serif, system-ui, sans-serif",fontSize:20,color:"var(--good)"}}>{money(saved.amount)}</span>
                      {!prop.isTest&&<MoreMenu slug={t.slug} name={t.name}/>}
                    </div>
                  </div>
                  <div style={{fontSize:13,color:"var(--muted)",marginTop:6}}>Electricity {money(saved.electricity)} · Rent {money(saved.rent)} · Misc {money(saved.misc)}{saved.carryIn?` · Adj ${money(saved.carryIn)}`:""}</div>
                  <div style={{fontSize:12,color:"var(--muted)",marginTop:4}}>prev {saved.previousReading} → curr {saved.currentReading} ({saved.units} units)</div>
                  {saved.paidAmount!=null&&(
                    <div style={{fontSize:13,marginTop:6,color: (saved.outstanding||0)>0?"var(--accent)":(saved.outstanding||0)<0?"var(--good)":"var(--muted)"}}>
                      Paid {money(saved.paidAmount)} · {(saved.outstanding||0)>0?`Short ${money(saved.outstanding)} (carries to next month)`:(saved.outstanding||0)<0?`Overpaid ${money(-saved.outstanding)} (credit next month)`:"Settled exactly"}
                    </div>
                  )}
                  <div style={{display:"flex",alignItems:"center",gap:10,marginTop:12,flexWrap:"wrap"}}>
                    <span style={{fontSize:12,color:"var(--good)",fontWeight:600}}>✓ Paid · billed {saved.savedAt?new Date(saved.savedAt).toLocaleDateString("en-IN"):""}</span>
                    <button onClick={()=>setConfirmUnpaid({slug:t.slug,pkey})} style={{marginLeft:"auto",background:"var(--field)",color:"var(--accent)",border:"1px solid var(--line)",borderRadius:9,padding:"9px 14px",fontSize:13,fontWeight:600,cursor:"pointer"}}>🔓 Unlock — mark unpaid</button>
                  </div>
                </div>
              );
            }

            return (
              <div key={t.slug} style={{...card,borderColor:mismatch&&!isApproved?"var(--accent)":"var(--line)"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8}}>
                  <strong>{t.name}</strong>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    {isApproved?<span style={{fontFamily:"'Geist', ui-sans-serif, system-ui, sans-serif",fontSize:20,color:"var(--good)"}}>{money(total)}</span>
                      :<span style={{fontSize:13,color:"var(--muted)",fontWeight:600}}>{hasReading?"awaiting your check":"no submission"}</span>}
                    {!prop.isTest&&<MoreMenu slug={t.slug} name={t.name}/>}
                  </div>
                </div>
                {isApproved&&<div style={{fontSize:12,color:"var(--good)",fontWeight:600,marginTop:2}}>✓ Approved — not yet paid</div>}
                {t.active===false&&<div style={{fontSize:12,color:"var(--accent)",fontWeight:600,marginTop:2}}>Inactive tenant (link blocked)</div>}

                {biStatus==="skip"&&(
                  <div style={{background:"var(--accent-weak)",border:"1px solid var(--good-line)",color:"var(--slate)",borderRadius:8,padding:"10px 12px",fontSize:13,margin:"10px 0",fontWeight:600}}>
                    ℹ Bi-monthly tenant — skip electricity this month. Next reading is due {label(shiftPeriod(period,1))}. You can still bill rent/misc below if needed.
                  </div>
                )}
                {biStatus==="bill"&&(
                  <div style={{fontSize:12,color:"var(--good)",margin:"6px 0 0"}}>Bi-monthly billing month — this reading covers two months of usage.</div>
                )}

                {hasReading&&(
                  <>
                    <div style={{margin:"10px 0"}}>
                      <div style={{...compareBox,textAlign:"left",padding:"10px 12px"}}><div style={lblSm}>Reading submitted by tenant</div><div style={{fontSize:20,fontWeight:700}}>{submitted??"—"}</div></div>
                    </div>
                    {photoUrl&&<div style={{margin:"8px 0"}}><div style={{...lblSm,marginBottom:4}}>Meter photo</div><img src={photoUrl} alt="meter" onClick={()=>setPhotoView(photoUrl)} style={{width:"100%",maxHeight:280,objectFit:"contain",borderRadius:10,border:"1px solid var(--line)",background:"var(--field)",cursor:"zoom-in"}}/><div style={{fontSize:12,color:"var(--slate)",marginTop:2}}>Tap photo to view full size</div></div>}
                    {r&&r.unlockedForResubmit&&<div style={{fontSize:12,color:"var(--accent)",marginBottom:6}}>Unlocked — tenant can submit again.</div>}
                    {!isApproved&&<button onClick={()=>resetSubmission(t.slug)} style={{...btn,background:"var(--card)",color:"var(--accent)",border:"1px solid var(--line)",marginTop:0,marginBottom:4,padding:"10px"}}>Unlock / reset tenant submission</button>}
                  </>
                )}
                {!hasReading&&biStatus!=="skip"&&(
                  <div style={{display:"flex",alignItems:"center",gap:8,margin:"8px 0 0"}}>
                    <p style={{fontSize:13,color:"var(--muted)",margin:0,flex:1}}>No meter reading for {label(period)} yet. You can still bill rent + misc.</p>
                    {!prop.isTest&&<a href={waUrl(t.phone,reminderText(t.name))} target="_blank" rel="noreferrer" style={{background:"var(--good)",color:"#fff",textDecoration:"none",borderRadius:8,padding:"8px 14px",fontSize:13,fontWeight:700,whiteSpace:"nowrap"}}>Remind</a>}
                  </div>
                )}
                {!hasReading&&biStatus==="skip"&&<p style={{fontSize:13,color:"var(--muted)",margin:"8px 0 0"}}>Bi-monthly off month — no reading needed.</p>}

                {/* Readings row — always visible */}
                <div style={{display:"flex",gap:8,alignItems:"flex-end",margin:"8px 0"}}>
                  <div style={{flex:1}}>
                    <label style={lblSm}>Previous {prev[t.slug]?"(auto)":""}</label>
                    <div style={{position:"relative"}}>
                      <input inputMode="numeric" value={prev[t.slug]||""} onChange={e=>setPrev({...prev,[t.slug]:e.target.value.replace(/[^0-9.]/g,"")})} disabled={isApproved||!prevUnlocked[t.slug]} style={{...inpSm,paddingRight:34,background:(isApproved||!prevUnlocked[t.slug])?"var(--accent-weak)":"#fff",color:"var(--ink)"}} placeholder="0"/>
                      {!isApproved&&(
                        <button type="button" onClick={()=>setPrevUnlocked({...prevUnlocked,[t.slug]:!prevUnlocked[t.slug]})} aria-label={prevUnlocked[t.slug]?"Lock previous":"Edit previous"} style={{position:"absolute",right:4,top:"50%",transform:"translateY(-50%)",border:"none",background:"transparent",cursor:"pointer",fontSize:15,padding:4,color:"var(--slate)"}}>
                          {prevUnlocked[t.slug]?"🔓":"✏️"}
                        </button>
                      )}
                    </div>
                  </div>
                  <div style={{flex:1}}><label style={lblSm}>Current</label><input inputMode="numeric" value={override[t.slug]!==undefined?override[t.slug]:(saved&&saved.currentReading!=null?saved.currentReading:(submitted??""))} onChange={e=>setOverride({...override,[t.slug]:e.target.value.replace(/[^0-9.]/g,"")})} disabled={isApproved} style={{...inpSm,background:isApproved?"var(--accent-weak)":"#fff"}}/></div>
                  <div style={{textAlign:"center",minWidth:46}}><div style={{fontWeight:700,color:"var(--slate)"}}>{units??"—"}</div><div style={{fontSize:10,color:"var(--muted)"}}>units</div></div>
                </div>

                {/* Electricity amount — always visible */}
                <div style={{fontSize:13,color:"var(--muted)",marginBottom:8}}>Electricity: {units!=null?`${units} × ₹${prop.rate} = `:""}<strong style={{color:"var(--ink)"}}>{money(elec)}</strong></div>

                {carry!==0&&(
                  <div style={{fontSize:13,marginBottom:8,color:carry>0?"var(--accent)":"var(--good)"}}>
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
                  <button onClick={()=>setConfirmSlug(t.slug)} style={{...btn,background:"var(--slate)",marginTop:10}} disabled={!hasReading&&rent===0&&misc===0}>Approve bill</button>
                ):(
                  <div style={{marginTop:12}}>
                    <div style={{fontSize:13,color:"var(--muted)",marginBottom:8}}>{elec!=null&&<>Electricity {money(elec)} · </>}Rent {money(rent)} · Misc {money(misc)}{carry!==0?` · Adj ${money(carry)}`:""} → <strong style={{color:"var(--ink)"}}>{money((elec||0)+rent+misc+carry)}</strong></div>
                    <div style={{display:"flex",gap:8,alignItems:"center"}}>
                      <button onClick={()=>unApprove(t.slug)} style={{...btn,background:"var(--card)",color:"var(--slate)",border:"1px solid var(--line)",width:"auto",padding:"12px 14px",marginTop:0}}>Edit</button>
                      <a href={waUrl(t.phone, waText(prop.name,t.name,[...(elec!=null?[{label:`Electricity (${units} units)`,amount:elec}]:[]),{label:"Rent",amount:rent},...(misc>0?[{label:"Misc"+(ex.miscNote?` (${ex.miscNote})`:""),amount:misc}]:[]),...(carry!==0?[{label:carry>0?"Previous balance":"Previous credit",amount:carry}]:[])],(elec||0)+rent+misc+carry, effective!=null?{previous:Number(prev[t.slug]||0),current:effective,units}:null))} target="_blank" rel="noreferrer" style={{...btn,textDecoration:"none",textAlign:"center",flex:1,background:"var(--good)",marginTop:0}}>Send bill on WhatsApp</a>
                    </div>
                    <div style={{marginTop:12}}>
                      <label style={lblSm}>Amount actually paid ₹ (leave blank if paid in full)</label>
                      <input inputMode="numeric" value={paidAmt[t.slug]??""} onChange={e=>setPaidAmt({...paidAmt,[t.slug]:e.target.value.replace(/[^0-9.]/g,"")})} style={inpSm} placeholder={String(Math.round((elec||0)+rent+misc+carry))}/>
                      {paidAmt[t.slug]!==undefined&&paidAmt[t.slug]!==""&&(()=>{ const out=Math.round((elec||0)+rent+misc+carry-Number(paidAmt[t.slug])); return <div style={{fontSize:12,marginTop:4,color:out>0?"var(--accent)":out<0?"var(--good)":"var(--muted)"}}>{out>0?`Short ${money(out)} — carries to next month`:out<0?`Overpaid ${money(-out)} — credit next month`:"Settled exactly"}</div>; })()}
                    </div>
                    <div style={{marginTop:14}}>
                      <SlideToPay onConfirm={async()=>{
                        setExtra(t.slug,"paid",true);
                        const bill=await saveOneBill(pkey,prop,t,true);
                        setData(prev=>prev?{...prev,bills:{...prev.bills,[t.slug]:bill}}:prev);
                        persistExtra(t.slug);
                      }}/>
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
          }} style={{...btn,background:"var(--ink)"}} disabled={saving}>{saving?"Saving…":"Save all approved bills to history"}</button>
          {savedMsg&&<p style={{fontSize:13,color:"var(--good)",textAlign:"center",marginTop:8}}>{savedMsg}</p>}

          <div style={{display:"flex",gap:8,marginTop:16}}>
            <a href={`/api/report?scope=month&period=${period}&pw=${encodeURIComponent(pw)}`} style={{...btn,background:"var(--accent-weak)",color:"var(--slate)",textDecoration:"none",textAlign:"center",marginTop:0}}>⬇ This month (CSV)</a>
            <a href={`/api/report?scope=year&year=${period.split("-")[0]}&pw=${encodeURIComponent(pw)}`} style={{...btn,background:"var(--accent-weak)",color:"var(--slate)",textDecoration:"none",textAlign:"center",marginTop:0}}>⬇ Full year (CSV)</a>
          </div>
          <p style={{fontSize:12,color:"var(--muted)",textAlign:"center",marginTop:6}}>Reports include only bills saved to history. Opens as a spreadsheet.</p>
        </div>
      )}
    </>
    );
  };

  // ── In-console move-out settlement (no separate login) ──
  const renderSettlement=()=>{
    const d=settleInfo;
    const rate=d?d.rate:9;
    const prev=d?d.lastReading:null;
    const fr=settle.finalReading!==""?Number(settle.finalReading):null;
    const units=(fr!=null&&prev!=null)?Math.max(0,fr-prev):0;
    const elec=units*rate;
    const rentN=settle.rentAdj!==""?Number(settle.rentAdj):0;
    const miscN=settle.misc!==""?Number(settle.misc):0;
    const depN=settle.deposit!==""?Number(settle.deposit):0;
    const dedT=settle.deductions.reduce((s,x)=>s+(Number(x.amount)||0),0);
    const depRefund=Math.max(0,depN-dedT);
    const carryN=settle.carry!==""?Number(settle.carry):0;
    const charges=elec+Math.max(0,rentN)+miscN+Math.max(0,carryN);
    const credits=depRefund+Math.max(0,-rentN)+Math.max(0,-carryN);
    const net=charges-credits; // +ve tenant pays, -ve you refund
    const settlementObj=()=>({moveOut:settle.moveOut,finalReading:fr,prevReading:prev,units,rate,electricity:elec,rentAdj:rentN,misc:miscN,miscNote:settle.miscNote,deposit:depN,deductions:settle.deductions,depositRefund:depRefund,carry:carryN,net});
    const saveSettlement=async()=>{
      setSettleBusy(true); setSettleMsg("");
      try{ const r=await fetch("/api/readings",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"save-settlement",pw,slug:settleSlug,settlement:settlementObj()})}); if(!r.ok) throw new Error(); setSettleMsg("Settlement saved and shared to the tenant."); }
      catch{ setSettleMsg("Could not save."); } finally{ setSettleBusy(false); }
    };
    const waSettlement=()=>{
      if(!d) return; const L=[]; L.push(`*Final settlement — ${d.name}*`); if(d.propertyName) L.push(d.propertyName);
      if(settle.moveOut) L.push(`Move-out: ${settle.moveOut}`); L.push("");
      if(units>0) L.push(`Electricity: ${units} units × ₹${rate} = ${money(elec)}`);
      if(rentN>0) L.push(`Rent: ${money(rentN)}`); if(rentN<0) L.push(`Rent refund: ${money(-rentN)}`);
      if(miscN) L.push(`Misc${settle.miscNote?` (${settle.miscNote})`:""}: ${money(miscN)}`);
      if(carryN) L.push(`${carryN>0?"Previous balance":"Previous credit"}: ${money(Math.abs(carryN))}`);
      if(depN){ L.push(""); L.push(`Deposit held: ${money(depN)}`); settle.deductions.forEach(x=>{ if(Number(x.amount)) L.push(`  − ${money(Number(x.amount))}${x.note?` (${x.note})`:""}`); }); L.push(`Deposit refund: ${money(depRefund)}`); }
      L.push(""); L.push(net>=0?`*Amount payable by you: ${money(net)}*`:`*Amount refundable to you: ${money(-net)}*`);
      let ph=null;
      if(data&&data.properties){ for(const p of Object.values(data.properties)){ const t=(p.tenants||[]).find(x=>x.slug===settleSlug); if(t){ ph=t.phone; break; } } }
      window.open(waUrl(ph,L.join("\n")),"_blank");
    };
    const finishMoveOut=async()=>{
      if(!window.confirm("Deactivate this tenant's link? Do this only once the settlement is fully paid/refunded. Their history stays saved.")) return;
      setSettleBusy(true);
      try{ await fetch("/api/readings",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"deactivate-tenant",pw,slug:settleSlug})}); setSettleMsg("Move-out complete — link deactivated."); await loadMoveouts(); }
      catch{ setSettleMsg("Could not deactivate."); } finally{ setSettleBusy(false); }
    };
    return (
      <div>
        <button onClick={()=>{ setView("billing"); }} style={{background:"transparent",border:"none",color:"var(--slate)",fontSize:13,fontWeight:600,cursor:"pointer",padding:0,marginBottom:10}}>‹ Back to billing</button>
        {!d?<p style={{color:"var(--muted)"}}>{settleMsg||"Loading tenant…"}</p>:(
        <div style={{...card,marginTop:0}}>
          <div style={{fontSize:12,color:"var(--muted)"}}>{d.propertyName} · rate ₹{rate}/unit · monthly rent {money(d.rent)}</div>
          <h2 style={{fontSize:18,fontWeight:600,letterSpacing:"-0.014em",margin:"6px 0 0"}}>Final settlement · {d.name}</h2>
          {d.finalReading!=null&&<div style={{...flagBox,marginTop:10}}>Tenant submitted final reading <b>{d.finalReading}</b>{d.finalPhotoUrl?" (photo attached)":""} — prefilled below.</div>}
          {d.finalPhotoUrl&&<img src={d.finalPhotoUrl} alt="final meter" onClick={()=>setPhotoView(d.finalPhotoUrl)} style={{width:"100%",maxHeight:220,objectFit:"contain",borderRadius:10,border:"1px solid var(--line)",background:"var(--field)",marginTop:8,cursor:"zoom-in"}}/>}

          <label style={lbl}>Move-out date (last day)</label>
          <input type="date" value={settle.moveOut} onChange={e=>setSF("moveOut",e.target.value)} style={inp}/>

          <label style={lbl}>Final meter reading</label>
          <input inputMode="numeric" value={settle.finalReading} onChange={e=>setSF("finalReading",e.target.value.replace(/[^0-9.]/g,""))} style={inp} placeholder="e.g. 8720"/>
          {prev!=null&&<div style={{fontSize:12,color:"var(--muted)",marginTop:4}}>Previous: <b>{prev}</b> → units: <b>{units}</b> → electricity: <b>{money(elec)}</b></div>}

          <label style={lbl}>Final rent adjustment (₹) — negative = refund</label>
          <input value={settle.rentAdj} onChange={e=>setSF("rentAdj",e.target.value.replace(/[^0-9.\-]/g,""))} style={inp} placeholder="e.g. -4000 (refund) or 3000 (owed)"/>

          <label style={lbl}>Misc charge (₹)</label>
          <input inputMode="numeric" value={settle.misc} onChange={e=>setSF("misc",e.target.value.replace(/[^0-9.]/g,""))} style={inp} placeholder="0"/>
          {settle.misc!==""&&Number(settle.misc)>0&&<input value={settle.miscNote} onChange={e=>setSF("miscNote",e.target.value)} style={{...inp,marginTop:6}} placeholder="Misc note (optional)"/>}

          <label style={lbl}>Previous balance (₹) — +they owe / −credit</label>
          <input value={settle.carry} onChange={e=>setSF("carry",e.target.value.replace(/[^0-9.\-]/g,""))} style={inp} placeholder="0"/>

          <label style={lbl}>Security deposit held (₹)</label>
          <input inputMode="numeric" value={settle.deposit} onChange={e=>setSF("deposit",e.target.value.replace(/[^0-9.]/g,""))} style={inp} placeholder="e.g. 15000"/>
          {settle.deposit!==""&&Number(settle.deposit)>0&&(
            <div style={{marginTop:10}}>
              <div style={{fontSize:11,fontWeight:700,color:"var(--muted)",textTransform:"uppercase",letterSpacing:.5}}>Deductions from deposit</div>
              {settle.deductions.map((x,i)=>(
                <div key={i} style={{display:"flex",gap:6,marginTop:6}}>
                  <input inputMode="numeric" value={x.amount} onChange={e=>{ const n=[...settle.deductions]; n[i]={...n[i],amount:e.target.value.replace(/[^0-9.]/g,"")}; setSF("deductions",n); }} style={{...inpSm,width:90}} placeholder="₹"/>
                  <input value={x.note} onChange={e=>{ const n=[...settle.deductions]; n[i]={...n[i],note:e.target.value}; setSF("deductions",n); }} style={{...inpSm,flex:1}} placeholder="Reason (e.g. repainting)"/>
                  <button onClick={()=>setSF("deductions",settle.deductions.filter((_,j)=>j!==i))} style={{border:"1px solid var(--line)",background:"var(--field)",color:"#e5484d",borderRadius:8,padding:"0 10px",cursor:"pointer"}}>✕</button>
                </div>
              ))}
              <button onClick={()=>setSF("deductions",[...settle.deductions,{amount:"",note:""}])} style={{...btn,background:"var(--field)",color:"var(--slate)",border:"1px solid var(--line)",marginTop:6,padding:9}}>+ Add deduction</button>
              <div style={{fontSize:12,color:"var(--muted)",marginTop:6}}>Deductions: {money(dedT)} → deposit refund: <b>{money(depRefund)}</b></div>
            </div>
          )}

          <div style={{marginTop:16,padding:14,borderRadius:12,border:"1px solid var(--line)",background:net>=0?"var(--warn-bg)":"var(--good-bg)"}}>
            <div style={{fontSize:11,fontWeight:700,color:"var(--muted)",textTransform:"uppercase",letterSpacing:.5}}>Settlement</div>
            <div style={{fontSize:22,fontWeight:600,marginTop:4,color:net>=0?"var(--accent)":"var(--good)"}}>{net>=0?`Tenant pays ${money(net)}`:`You refund ${money(-net)}`}</div>
          </div>

          {settleMsg&&<p style={{color:"var(--good)",fontSize:13,marginTop:10}}>{settleMsg}</p>}
          <button onClick={saveSettlement} disabled={settleBusy} style={{...btn,background:"var(--ink)",color:"var(--paper)"}}>{settleBusy?"Saving…":"Save & share settlement"}</button>
          <button onClick={waSettlement} style={{...btn,background:"#25D366",color:"#fff"}}>Send to tenant on WhatsApp</button>
          <button onClick={finishMoveOut} disabled={settleBusy} style={{...btn,background:"var(--card)",color:"#e5484d",border:"1px solid var(--line)"}}>Deactivate link — complete move-out</button>
        </div>
        )}
      </div>
    );
  };

  const themeVars = theme==="dark"
    ? { "--paper":"#0a0a0a","--card":"#111111","--elev":"#161616","--ink":"#ededed","--muted":"#a1a1a1","--faint":"#737373","--line":"#262626","--hair":"#1f1f1f","--field":"#0d0d0d","--slate":"#6aa8ff","--accent":"#e5a13a","--good":"#4cc38a","--good-bg":"#0e1f16","--good-line":"#1d4030","--warn-bg":"#211803","--warn-line":"#433310","--accent-weak":"#0d1220","--primary-bg":"#ffffff","--primary-fg":"#0a0a0a","--shadow":"0 1px 2px rgba(0,0,0,0.4)" }
    : { "--paper":"#fafafa","--card":"#ffffff","--elev":"#f6f6f6","--ink":"#0a0a0a","--muted":"#666666","--faint":"#8f8f8f","--line":"#eaeaea","--hair":"#f2f2f2","--field":"#fafafa","--slate":"#0068d6","--accent":"#b45309","--good":"#0f7b34","--good-bg":"#edf7f0","--good-line":"#c6e5cf","--warn-bg":"#fff8eb","--warn-line":"#f5e0b3","--accent-weak":"#f4f9ff","--primary-bg":"#0a0a0a","--primary-fg":"#ffffff","--shadow":"0 1px 2px rgba(0,0,0,0.04)" };

  // Month summary for the rail (real values from saved bills / readings).
  let sumBilled=0,sumCollected=0,paidCount=0,tenantCount=0,noReadingCount=0; const attention=[];
  if(data){
    Object.entries(data.properties).forEach(([pk,prop])=>{
      if(prop.isTest) return;
      prop.tenants.forEach((t)=>{
        tenantCount++;
        const b=data.bills?data.bills[t.slug]:null;
        const r=data.readings?data.readings[t.slug]:null;
        if(b){ sumBilled+=b.amount||0; if(b.paid){ sumCollected+=(b.paidAmount!=null?b.paidAmount:b.amount); paidCount++; } }
        if(!r) noReadingCount++;
        const ai=r&&r.aiReading!=null?r.aiReading:null;
        if(ai!=null&&r&&Number(ai)!==Number(r.reading)&&!(b&&b.paid)) attention.push({name:t.name,kind:"mismatch"});
      });
    });
  }
  const outstanding=sumBilled-sumCollected;
  const collectedPct= sumBilled>0 ? Math.round((sumCollected/sumBilled)*100) : 0;
  const propsForNav = (data&&data.properties) || reg || null;
  const dotColors=["var(--good)","var(--slate)","var(--faint)","var(--accent)"];

  const NavIcon=({name})=>{
    const c={
      billing:<path d="M4 4h16v16l-2.5-1.6L15 20l-3-1.6L9 20l-2.5-1.6L4 20V4Z M8.5 9h7 M8.5 13h4"/>,
      manage:<g><circle cx="9" cy="8" r="3.2"/><path d="M3.5 19a5.5 5.5 0 0 1 11 0 M16 5.5a3 3 0 0 1 0 5.6 M17.5 19a5 5 0 0 0-2-4"/></g>,
      staff:<g><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7 M3 12h18"/></g>,
    }[name];
    return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{c}</svg>;
  };
  const ThemeBtn=({compact})=>(
    <button onClick={toggleTheme} aria-label="Toggle light or dark theme" style={{display:"flex",alignItems:"center",gap:6,height:32,padding:"0 12px",border:"1px solid var(--line)",borderRadius:6,background:"var(--card)",color:"var(--ink)",fontSize:13,fontWeight:500,cursor:"pointer"}}>
      {theme==="dark"
        ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M19 5l-1.5 1.5M6.5 17.5 5 19"/></svg>
        : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/></svg>}
      {compact?null:(theme==="dark"?"Light":"Dark")}
    </button>
  );
  const MonthStepper=()=>(
    <div style={{display:"flex",alignItems:"center",gap:2,height:32,padding:"0 4px",border:"1px solid var(--line)",borderRadius:8,background:"var(--card)"}}>
      <button onClick={async()=>{ const p=shiftPeriod(period,-1); setPeriod(p); if(view==="staff"){await loadStaff(p);}else{await fetchPeriod(p,pw);} }} style={stepBtn} aria-label="Previous month">‹</button>
      <div style={{fontSize:13,fontWeight:500,minWidth:104,textAlign:"center",color:"var(--ink)"}}>{label(period)}</div>
      <button onClick={async()=>{ const p=shiftPeriod(period,1); setPeriod(p); if(view==="staff"){await loadStaff(p);}else{await fetchPeriod(p,pw);} }} style={stepBtn} aria-label="Next month">›</button>
    </div>
  );

  return (
    <div style={{...themeVars, background:"var(--paper)", color:"var(--ink)", minHeight:"100vh"}}>
      <style>{`
        .admin-wrap ::placeholder{ color: var(--muted); opacity:.6; }
        .admin-wrap input[type=checkbox]{ accent-color: var(--slate); }
        .admin-wrap input:focus, .admin-wrap textarea:focus{ outline:none; border-color: var(--slate); box-shadow:0 0 0 3px color-mix(in srgb, var(--slate) 18%, transparent); }
        .admin-wrap button{ transition: filter .15s, transform .05s; }
        .admin-wrap button:active{ transform: translateY(1px); }
        .admin-wrap a, .admin-wrap button{ -webkit-tap-highlight-color: transparent; }
        .console{ display:flex; min-height:100vh; align-items:stretch; }
        .sidebar{ width:240px; flex-shrink:0; background:var(--card); border-right:1px solid var(--line); display:flex; flex-direction:column; padding:16px 12px; position:sticky; top:0; height:100vh; }
        .maincol{ flex:1; min-width:0; display:flex; flex-direction:column; }
        .topbar{ display:flex; align-items:center; gap:12px; min-height:60px; padding:0 20px; border-bottom:1px solid var(--line); position:sticky; top:0; background:var(--paper); z-index:10; }
        .content{ flex:1; display:flex; gap:20px; padding:20px; min-width:0; align-items:flex-start; }
        .contentmain{ flex:1; min-width:0; }
        .rail{ width:300px; flex-shrink:0; position:sticky; top:80px; }
        .navitem{ display:flex; align-items:center; gap:10px; height:34px; padding:0 10px; border-radius:6px; font-size:13px; font-weight:500; cursor:pointer; border:none; background:transparent; color:var(--muted); width:100%; text-align:left; }
        .navitem.active{ background:var(--elev); color:var(--ink); }
        .bottomnav{ display:none; }
        .navbtn{ flex:1; display:flex; flex-direction:column; align-items:center; gap:3px; padding:6px 4px; border:none; background:transparent; color:var(--muted); font-size:11px; font-weight:500; cursor:pointer; border-radius:8px; }
        .navbtn.active{ color:var(--ink); }
        @media (max-width: 899px){
          .console{ display:block; }
          .sidebar,.rail{ display:none; }
          .topbar{ position:static; min-height:auto; padding:14px 16px; flex-wrap:wrap; }
          .content{ display:block; padding:16px 16px calc(80px + env(safe-area-inset-bottom)); max-width:600px; margin:0 auto; }
          .bottomnav{ display:flex; position:fixed; left:0; right:0; bottom:0; z-index:40; gap:4px; background:var(--card); border-top:1px solid var(--line); padding:6px 8px calc(6px + env(safe-area-inset-bottom)); }
        }
      `}</style>
      <div className="admin-wrap console">

        <aside className="sidebar">
          <div style={{display:"flex",alignItems:"center",gap:10,padding:"4px 10px 18px"}}>
            <div style={{width:28,height:28,borderRadius:7,background:"var(--primary-bg)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--primary-fg)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M10 21v-6h4v6"/></svg>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:1,minWidth:0}}>
              <div style={{fontSize:13,fontWeight:600,color:"var(--ink)",letterSpacing:"-0.011em"}}>Meter Billing</div>
              <div style={{fontSize:11,color:"var(--faint)"}}>Owner console</div>
            </div>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:2}}>
            <button className={"navitem"+(view==="billing"?" active":"")} onClick={()=>setView("billing")}><NavIcon name="billing"/>Billing</button>
            <button className={"navitem"+(view==="manage"?" active":"")} onClick={openManage}><NavIcon name="manage"/>Tenants</button>
            <button className={"navitem"+(view==="staff"?" active":"")} onClick={openStaff}><NavIcon name="staff"/>House help</button>
          </div>
          {propsForNav&&(
            <>
              <div style={{height:1,background:"var(--line)",margin:"16px 10px"}}/>
              <div style={{fontSize:11,fontWeight:500,color:"var(--faint)",padding:"0 10px 8px"}}>Properties</div>
              <div style={{display:"flex",flexDirection:"column",gap:2}}>
                {Object.entries(propsForNav).map(([pk,prop],idx)=>(
                  <div key={pk} style={{display:"flex",alignItems:"center",gap:10,height:30,padding:"0 10px",borderRadius:6,color:"var(--muted)",fontSize:13}}>
                    <span style={{width:6,height:6,borderRadius:999,background:dotColors[idx%dotColors.length],flexShrink:0}}/>
                    <span style={{flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{prop.name}</span>
                    <span style={{fontSize:11,color:"var(--faint)"}}>{prop.tenants?prop.tenants.length:0}</span>
                  </div>
                ))}
              </div>
            </>
          )}
          <div style={{flex:1}}/>
          <div style={{display:"flex",alignItems:"center",gap:10,padding:10,borderTop:"1px solid var(--line)"}}>
            <img src="/admin-logo.png" alt="" style={{width:28,height:28,borderRadius:999,objectFit:"cover",border:"1px solid var(--line)"}}/>
            <div style={{flex:1,display:"flex",flexDirection:"column",gap:1}}>
              <div style={{fontSize:12,fontWeight:500,color:"var(--ink)"}}>Signed in</div>
              <div style={{fontSize:11,color:"var(--faint)"}}>Owner</div>
            </div>
          </div>
        </aside>

        <div className="maincol">
          <div className="topbar">
            <h1 style={{fontSize:16,fontWeight:600,letterSpacing:"-0.014em",margin:0,color:"var(--ink)"}}>{view==="billing"?"Billing":view==="manage"?"Tenants":view==="settlement"?"Move-out":"House help"}</h1>
            {(view==="billing"||view==="staff")&&<MonthStepper/>}
            <div style={{flex:1}}/>
            <ThemeBtn/>
          </div>

          <div className="content">
            <div className="contentmain">
              {view==="settlement"?renderSettlement():view==="billing"?renderBilling():view==="manage"?renderManage():renderStaff()}
            </div>
            {view==="billing"&&data&&(
              <aside className="rail">
                <div style={{border:"1px solid var(--line)",borderRadius:12,background:"var(--card)",padding:16,display:"flex",flexDirection:"column",gap:14}}>
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                    <div style={{fontSize:13,fontWeight:600,color:"var(--ink)"}}>{label(period)}</div>
                    <div style={{fontSize:12,color:"var(--faint)"}}>{paidCount} of {tenantCount} paid</div>
                  </div>
                  <div style={{display:"flex",flexDirection:"column",gap:10}}>
                    <div style={{display:"flex",justifyContent:"space-between"}}><span style={{fontSize:13,color:"var(--muted)"}}>Billed</span><span style={{fontSize:14,fontWeight:500,color:"var(--ink)"}}>{money(sumBilled)}</span></div>
                    <div style={{display:"flex",justifyContent:"space-between"}}><span style={{fontSize:13,color:"var(--muted)"}}>Collected</span><span style={{fontSize:14,fontWeight:500,color:"var(--good)"}}>{money(sumCollected)}</span></div>
                    <div style={{display:"flex",justifyContent:"space-between"}}><span style={{fontSize:13,color:"var(--muted)"}}>Outstanding</span><span style={{fontSize:14,fontWeight:600,color:"var(--accent)"}}>{money(outstanding)}</span></div>
                  </div>
                  <div style={{display:"flex",flexDirection:"column",gap:6}}>
                    <div style={{height:6,borderRadius:999,background:"var(--elev)",overflow:"hidden",display:"flex"}}><div style={{width:collectedPct+"%",background:"var(--good)"}}/></div>
                    <div style={{fontSize:11,color:"var(--faint)"}}>{collectedPct}% collected</div>
                  </div>
                </div>
                <div style={{border:"1px solid var(--line)",borderRadius:12,background:"var(--card)",padding:"16px 16px 4px",display:"flex",flexDirection:"column",marginTop:16}}>
                  <div style={{fontSize:13,fontWeight:600,color:"var(--ink)",paddingBottom:12}}>Needs attention</div>
                  {noReadingCount>0&&(
                    <div style={{display:"flex",alignItems:"flex-start",gap:10,padding:"12px 0",borderTop:"1px solid var(--hair)"}}>
                      <span style={{width:6,height:6,borderRadius:999,background:"var(--faint)",marginTop:6,flexShrink:0}}/>
                      <div style={{flex:1,fontSize:13,color:"var(--ink)"}}>{noReadingCount} tenant{noReadingCount>1?"s have":" has"} not submitted a reading</div>
                    </div>
                  )}
                  {attention.slice(0,4).map((a,i)=>(
                    <div key={i} style={{display:"flex",alignItems:"flex-start",gap:10,padding:"12px 0",borderTop:"1px solid var(--hair)"}}>
                      <span style={{width:6,height:6,borderRadius:999,background:"var(--accent)",marginTop:6,flexShrink:0}}/>
                      <div style={{flex:1,fontSize:13,color:"var(--ink)"}}>{a.name}<div style={{fontSize:12,color:"var(--faint)"}}>Reading and photo differ — check before approving</div></div>
                    </div>
                  ))}
                  {noReadingCount===0&&attention.length===0&&<div style={{fontSize:13,color:"var(--faint)",padding:"12px 0",borderTop:"1px solid var(--hair)"}}>All caught up.</div>}
                </div>
              </aside>
            )}
          </div>

          <nav className="bottomnav">
            <button className={"navbtn"+(view==="billing"?" active":"")} onClick={()=>setView("billing")}><NavIcon name="billing"/>Billing</button>
            <button className={"navbtn"+(view==="manage"?" active":"")} onClick={openManage}><NavIcon name="manage"/>Tenants</button>
            <button className={"navbtn"+(view==="staff"?" active":"")} onClick={openStaff}><NavIcon name="staff"/>House help</button>
          </nav>
        </div>

        {/* Approve confirmation dialog */}
        {confirmSlug&&(
          <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",display:"flex",alignItems:"center",justifyContent:"center",padding:20,zIndex:50}} onClick={()=>setConfirmSlug(null)}>
            <div style={{background:"var(--card)",color:"var(--ink)",border:"1px solid var(--line)",borderRadius:14,padding:22,maxWidth:340,width:"100%"}} onClick={e=>e.stopPropagation()}>
              <h3 style={{margin:"0 0 8px",fontSize:17,fontWeight:600,letterSpacing:"-0.014em"}}>Approve this bill?</h3>
              <p style={{fontSize:14,color:"var(--muted)",margin:"0 0 18px"}}>Once approved, you can send it on WhatsApp and mark it paid. You can still tap Edit to change it.</p>
              <div style={{display:"flex",gap:8}}>
                <button onClick={()=>setConfirmSlug(null)} style={{...btn,background:"var(--card)",color:"var(--ink)",border:"1px solid var(--line)",marginTop:0}}>Cancel</button>
                <button onClick={()=>{ const s=confirmSlug; const pv=Number(prev[s]||0); const r=data.readings?data.readings[s]:null; const ov=override[s]; const cv= ov!==undefined&&ov!==""?Number(ov):(r?r.reading:null); doApprove(s,pv,cv); }} style={{...btn,background:"var(--good)",color:"#fff",marginTop:0}}>Approve</button>
              </div>
            </div>
          </div>
        )}

        {/* Mark-unpaid confirmation dialog */}
        {confirmUnpaid&&(
          <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",display:"flex",alignItems:"center",justifyContent:"center",padding:20,zIndex:50}} onClick={()=>setConfirmUnpaid(null)}>
            <div style={{background:"var(--card)",color:"var(--ink)",border:"1px solid var(--line)",borderRadius:14,padding:22,maxWidth:340,width:"100%"}} onClick={e=>e.stopPropagation()}>
              <h3 style={{margin:"0 0 8px",fontSize:17,fontWeight:600,letterSpacing:"-0.014em"}}>Mark this bill unpaid?</h3>
              <p style={{fontSize:14,color:"var(--muted)",margin:"0 0 18px"}}>This will unlock the bill for editing again and show the meter photo. You can re-mark it paid afterwards.</p>
              <div style={{display:"flex",gap:8}}>
                <button onClick={()=>setConfirmUnpaid(null)} style={{...btn,background:"var(--card)",color:"var(--ink)",border:"1px solid var(--line)",marginTop:0}}>Cancel</button>
                <button onClick={async()=>{
                  const {slug,pkey}=confirmUnpaid;
                  const prop=data.properties[pkey];
                  const t=prop.tenants.find(x=>x.slug===slug);
                  setConfirmUnpaid(null);
                  setExtra(slug,"paid",false);
                  const bill=await saveOneBill(pkey,prop,t,false);
                  setData(prev=>prev?{...prev,bills:{...prev.bills,[slug]:bill}}:prev);
                  persistExtra(slug);
                }} style={{...btn,background:"var(--accent)",color:"#fff",marginTop:0}}>Mark unpaid</button>
              </div>
            </div>
          </div>
        )}

        {/* Click-away to close the ⋯ menu */}
        {openMenu&&<div onClick={()=>setOpenMenu(null)} style={{position:"fixed",inset:0,zIndex:20}}/>}

        {/* Start move-out confirmation */}
        {confirmMoveOut&&(
          <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",display:"flex",alignItems:"center",justifyContent:"center",padding:20,zIndex:50}} onClick={()=>setConfirmMoveOut(null)}>
            <div style={{background:"var(--card)",color:"var(--ink)",border:"1px solid var(--line)",borderRadius:14,padding:22,maxWidth:360,width:"100%"}} onClick={e=>e.stopPropagation()}>
              <h3 style={{margin:"0 0 8px",fontSize:17,fontWeight:600,letterSpacing:"-0.014em"}}>Start move-out for {confirmMoveOut.name}?</h3>
              <p style={{fontSize:14,color:"var(--muted)",margin:"0 0 18px",lineHeight:1.5}}>Their app will unlock a <strong>final reading</strong> to submit on move-out day. Monthly billing pauses. You can cancel this before they submit.</p>
              <div style={{display:"flex",gap:8}}>
                <button onClick={()=>setConfirmMoveOut(null)} style={{...btn,background:"var(--card)",color:"var(--ink)",border:"1px solid var(--line)",marginTop:0}}>Cancel</button>
                <button onClick={()=>startMoveOut(confirmMoveOut.slug)} style={{...btn,background:"var(--accent)",color:"#fff",marginTop:0}}>Start move-out</button>
              </div>
            </div>
          </div>
        )}

        {/* Full-screen photo preview */}
        {photoView&&(
          <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.9)",display:"flex",alignItems:"center",justifyContent:"center",padding:16,zIndex:60}} onClick={()=>setPhotoView(null)}>
            <img src={photoView} alt="meter full" style={{maxWidth:"100%",maxHeight:"90vh",objectFit:"contain",borderRadius:8}}/>
            <button onClick={()=>setPhotoView(null)} aria-label="Close" style={{position:"absolute",top:16,right:16,background:"rgba(255,255,255,0.15)",color:"#fff",border:"none",borderRadius:20,width:40,height:40,fontSize:20,cursor:"pointer"}}>✕</button>
          </div>
        )}
      </div>
    </div>
  );
}

// Slide all the way right to confirm. Calls onConfirm() when completed.
function SlideToPay({onConfirm,label="Slide to mark paid"}){
  const trackRef=useRef(null);
  const [x,setX]=useState(0);        // handle offset in px
  const [dragging,setDragging]=useState(false);
  const [done,setDone]=useState(false);
  const handleW=44;
  const startX=useRef(0);
  const maxX=useRef(0);

  const begin=(clientX)=>{
    if(done) return;
    const track=trackRef.current; if(!track) return;
    maxX.current = track.clientWidth - handleW - 6;
    startX.current = clientX - x;
    setDragging(true);
  };
  const move=(clientX)=>{
    if(!dragging||done) return;
    let nx = clientX - startX.current;
    nx = Math.max(0, Math.min(nx, maxX.current));
    setX(nx);
  };
  const end=()=>{
    if(!dragging||done) return;
    setDragging(false);
    if(x >= maxX.current - 4){
      setX(maxX.current); setDone(true);
      setTimeout(()=>onConfirm&&onConfirm(),150);
    } else {
      setX(0); // snap back if not completed
    }
  };

  useEffect(()=>{
    if(!dragging) return;
    const mm=(e)=>move(e.touches?e.touches[0].clientX:e.clientX);
    const mu=()=>end();
    window.addEventListener("mousemove",mm); window.addEventListener("mouseup",mu);
    window.addEventListener("touchmove",mm,{passive:false}); window.addEventListener("touchend",mu);
    return ()=>{ window.removeEventListener("mousemove",mm); window.removeEventListener("mouseup",mu); window.removeEventListener("touchmove",mm); window.removeEventListener("touchend",mu); };
  });

  const pct = maxX.current? x/maxX.current : 0;
  return (
    <div ref={trackRef} style={{position:"relative",width:"100%",height:52,borderRadius:26,background:"var(--field)",border:"1px solid var(--line)",overflow:"hidden",userSelect:"none",touchAction:"none"}}>
      <div style={{position:"absolute",inset:0,borderRadius:26,background:`linear-gradient(90deg, var(--good) 0%, var(--good) ${Math.max(pct*100,8)}%, transparent ${Math.max(pct*100,8)}%)`,opacity:0.18}}/>
      <div style={{position:"absolute",width:"100%",textAlign:"center",lineHeight:"52px",fontSize:14,fontWeight:600,color:done?"var(--good)":"var(--muted)",pointerEvents:"none"}}>
        {done?"✓ Paid":label+" →"}
      </div>
      <div
        onMouseDown={(e)=>begin(e.clientX)}
        onTouchStart={(e)=>begin(e.touches[0].clientX)}
        style={{position:"absolute",top:3,left:3,transform:`translateX(${x}px)`,width:handleW,height:44,borderRadius:22,background:done?"var(--good)":"var(--slate)",color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",cursor:done?"default":"grab",transition:dragging?"none":"transform .2s",boxShadow:"0 1px 4px rgba(0,0,0,0.25)",fontSize:18}}>
        {done?"✓":"›"}
      </div>
    </div>
  );
}

const lbl={display:"block",fontSize:11,color:"var(--muted)",fontWeight:600,margin:"12px 0 5px",textTransform:"uppercase",letterSpacing:.7};
const lblSm={display:"block",fontSize:10,color:"var(--muted)",fontWeight:600,marginBottom:3,textTransform:"uppercase",letterSpacing:.5};
const inp={width:"100%",boxSizing:"border-box",border:"1px solid var(--line)",borderRadius:10,padding:"12px 13px",fontSize:16,background:"var(--field)",color:"var(--ink)",transition:"border-color .15s"};
const inpSm={width:"100%",boxSizing:"border-box",border:"1px solid var(--line)",borderRadius:9,padding:"9px 11px",fontSize:15,background:"var(--field)",color:"var(--ink)"};
const btn={width:"100%",background:"var(--ink)",color:"var(--paper)",border:"none",borderRadius:11,padding:"13px 16px",fontWeight:600,cursor:"pointer",marginTop:10,fontSize:14,letterSpacing:.2};
const stepBtn={border:"none",background:"transparent",fontSize:20,width:32,height:32,cursor:"pointer",color:"var(--slate)",borderRadius:8};
const card={background:"var(--card)",border:"1px solid var(--line)",borderRadius:14,padding:16,marginTop:12,boxShadow:"var(--shadow)"};
const compareBox={flex:1,textAlign:"center",background:"var(--field)",border:"1px solid var(--line)",borderRadius:10,padding:"9px 8px",color:"var(--ink)"};
const flagBox={background:"rgba(176,106,60,0.12)",border:"1px solid var(--accent)",color:"var(--accent)",borderRadius:9,padding:"9px 11px",fontSize:13,fontWeight:600,margin:"4px 0"};
const tabBtn={flex:1,padding:"11px",borderRadius:11,border:"1px solid var(--line)",background:"var(--card)",fontWeight:600,fontSize:14,cursor:"pointer",color:"var(--muted)",transition:"all .15s"};
const tabActive={background:"var(--slate)",color:"#fff",borderColor:"var(--slate)",boxShadow:"var(--shadow)"};
