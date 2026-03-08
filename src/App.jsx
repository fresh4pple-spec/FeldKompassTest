import { useState, useEffect, useCallback, useRef } from "react";

/* ─── GLOBAL CSS ─── */
const GS = `
@import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,wght@0,300;0,500;0,700;1,300&family=Instrument+Sans:wght@400;500;600&display=swap');
*{box-sizing:border-box;margin:0;padding:0}
body{-webkit-font-smoothing:antialiased}
@keyframes spin{to{transform:rotate(360deg)}}
@keyframes fadeUp{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}
@keyframes fadeIn{from{opacity:0}to{opacity:1}}
@keyframes slideRight{from{width:0}to{width:var(--w)}}
@keyframes pop{0%{transform:scale(.8);opacity:0}70%{transform:scale(1.05)}100%{transform:scale(1);opacity:1}}
@keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}
.fu{animation:fadeUp .35s ease both}
.spin{animation:spin .9s linear infinite}
.pop{animation:pop .3s ease both}
.hov{transition:transform .18s,box-shadow .18s}
.hov:hover{transform:translateY(-2px);box-shadow:0 18px 52px rgba(0,0,0,.42)!important}
`;

/* ─── CONSTANTS ─── */
const CROPS={ackerbau:["Winterweizen","Sommergerste","Raps","Mais","Zuckerrüben"],gemüse:["Kartoffeln","Möhren","Zwiebeln","Salat","Spinat","Kohl"]};
const SOILS=["Sandiger Boden","Lehmiger Boden","Tonboden","Humoser Boden","Schluffboden"];
const PREV=["Winterweizen","Raps","Mais","Leguminosen","Brache","Zuckerrüben","Kartoffeln","Gemüse"];
const COLORS=["#2d6a27","#1d4ed8","#7c3aed","#c2410c","#0369a1","#be185d"];
const AVATARS=["👨‍🌾","👩‍🌾","🧑‍🌾","👴","👵","🧔"];
const FONT="'Instrument Sans',sans-serif";
const SERIF="'Fraunces',Georgia,serif";

/* ─── WEATHER ─── */
async function fetchWeather(lat,lon){
  const r=await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,precipitation,weathercode,windspeed_10m,relativehumidity_2m&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,weathercode&forecast_days=1&timezone=auto`);
  return r.json();
}
function wInfo(c){
  if(c===0)return{icon:"☀️",text:"Sonnig & klar",color:"#f59e0b"};
  if(c<=3)return{icon:"⛅",text:"Bewölkt",color:"#94a3b8"};
  if(c<=48)return{icon:"🌫️",text:"Nebelig",color:"#94a3b8"};
  if(c<=67)return{icon:"🌧️",text:"Regnerisch",color:"#3b82f6"};
  if(c<=77)return{icon:"❄️",text:"Schneefall",color:"#93c5fd"};
  if(c<=82)return{icon:"🌦️",text:"Schauer",color:"#60a5fa"};
  return{icon:"⛈️",text:"Gewitter",color:"#6366f1"};
}
function getSeason(){const m=new Date().getMonth()+1;return m<=2||m===12?"Winter":m<=5?"Frühling":m<=8?"Sommer":"Herbst";}
function todayStr(){return new Date().toLocaleDateString("de-DE",{weekday:"long",day:"numeric",month:"long"});}
function todayKey(){return new Date().toISOString().split("T")[0];}

/* ─── AI ─── */
async function fetchAI(field,weather,helpers){
  const hn=helpers.map(h=>h.name).join(", ")||"keine";
  const p=`Du bist ein erfahrener Landwirtschaftsberater. Heute: ${todayStr()}, Jahreszeit: ${getSeason()}.

Betrieb:
- Kultur: ${field.crop} (${field.type}), Boden: ${field.soil}, Vorfrucht: ${field.prevCrop}
- Standort: ${field.locationName}
- Wetter: ${weather.icon} ${weather.text}, ${weather.temp}°C, Regen: ${weather.precip}mm, Wind: ${weather.wind}km/h, Feuchtigkeit: ${weather.humidity}%

Verfügbare Helfer: ${hn}

Antworte NUR mit JSON (kein Text, keine Backticks):
{
  "headline": "Prägnante Tagesüberschrift max 7 Wörter",
  "priority": "hoch|mittel|niedrig",
  "summary": "Ein Satz Lagebeschreibung",
  "weatherWarning": "Wetterwarnung falls relevant, sonst null",
  "tasks": [
    {"id":"t1","icon":"🌱","title":"Titel","detail":"Anweisung 1-2 Sätze","status":"ok|warn|alert","duration":"z.B. 1-2h","assignable":true,"category":"Bodenbearbeitung|Düngung|Bewässerung|Pflanzenschutz|Aussaat|Ernte|Maschinen"}
  ],
  "outlook": "Ausblick 2-3 Tage"
}
Genau 5 tasks. assignable=true bei körperlicher Feldarbeit.`;

  const res=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:1300,messages:[{role:"user",content:p}]})});
  const d=await res.json();
  const t=d.content.map(b=>b.text||"").join("").replace(/```json|```/g,"").trim();
  return JSON.parse(t);
}

/* ─── STATUS ─── */
const SS={ok:{bg:"#f0fdf4",border:"#86efac",badge:"#16a34a",label:"Optimal"},warn:{bg:"#fffbeb",border:"#fde68a",badge:"#d97706",label:"Achtung"},alert:{bg:"#fff1f2",border:"#fecaca",badge:"#dc2626",label:"Dringend"}};
const PC={hoch:"#dc2626",mittel:"#d97706",niedrig:"#16a34a"};
const CAT_ICONS={"Bodenbearbeitung":"⚙️","Düngung":"🧪","Bewässerung":"💧","Pflanzenschutz":"🛡️","Aussaat":"🌱","Ernte":"🚜","Maschinen":"🔧"};

/* ─── IN-MEMORY STATE ─── */
let MEM={fields:[],helpers:[],assignments:{},completions:{},notes:{},log:[]};

/* ══════════════════════════════════════════ */
export default function App(){
  const [s,setS]=useState(MEM);
  const [view,setView]=useState("dash");
  const [activeField,setAF]=useState(null);
  const [activeHelper,setAH]=useState(null);
  const [modal,setModal]=useState(null);
  const [assignTask,setAT]=useState(null);
  const [weather,setWeather]=useState(null);
  const [aiData,setAI]=useState(null);
  const [loading,setLoading]=useState(false);
  const [loadMsg,setLM]=useState("");
  const [gps,setGps]=useState({status:"idle",lat:null,lon:null,name:""});
  const [fForm,setFF]=useState({name:"",type:"ackerbau",crop:"",soil:"",prevCrop:""});
  const [hForm,setHF]=useState({name:"",role:"",avatar:"👨‍🌾",color:"#2d6a27"});
  const [tab,setTab]=useState("felder");
  const [notif,setNotif]=useState(null);
  const [noteText,setNoteText]=useState("");
  const [showLog,setShowLog]=useState(false);
  const [noteField,setNoteField]=useState(null);

  const save=useCallback(u=>{const n={...MEM,...u};MEM=n;setS(n);},[]);
  const notify=(msg,t="ok")=>{setNotif({msg,t});setTimeout(()=>setNotif(null),3000);};

  /* GPS */
  const getGPS=()=>{
    if(!navigator.geolocation){setGps(g=>({...g,status:"error"}));return;}
    setGps(g=>({...g,status:"loading"}));
    navigator.geolocation.getCurrentPosition(async pos=>{
      const{latitude:lat,longitude:lon}=pos.coords;
      let name=`${lat.toFixed(3)}°N`;
      try{const r=await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`);const d=await r.json();name=d.address?.village||d.address?.town||d.address?.city||d.address?.county||name;}catch(_){}
      setGps({status:"ok",lat,lon,name});
    },()=>setGps(g=>({...g,status:"error"})));
  };

  /* Open field */
  const openField=async(field)=>{
    setAF(field);setAI(null);setWeather(null);setLoading(true);setLM("📡 Wetterdaten werden geladen…");
    try{
      const wd=await fetchWeather(field.lat,field.lon);
      const wi=wInfo(wd.current.weathercode);
      const w={...wi,temp:Math.round(wd.current.temperature_2m),precip:wd.daily.precipitation_sum[0]||0,wind:Math.round(wd.current.windspeed_10m),max:Math.round(wd.daily.temperature_2m_max[0]),min:Math.round(wd.daily.temperature_2m_min[0]),humidity:wd.current.relativehumidity_2m||0};
      setWeather(w);setLM("🤖 KI analysiert Ihre Felder…");
      const ai=await fetchAI(field,w,s.helpers);
      setAI(ai);
      // Log entry
      const entry={date:todayStr(),key:todayKey(),field:field.name,headline:ai.headline,weather:`${w.icon} ${w.temp}°C`};
      save({log:[entry,...MEM.log].slice(0,50)});
    }catch(e){setAI({headline:"Update verfügbar",priority:"niedrig",summary:"",tasks:[],outlook:""});}
    setLoading(false);
  };

  const saveField=()=>{
    if(!fForm.name||!fForm.crop||!fForm.soil||!fForm.prevCrop||gps.status!=="ok")return;
    const f={...fForm,lat:gps.lat,lon:gps.lon,locationName:gps.name,id:Date.now(),addedAt:new Date().toLocaleDateString("de-DE")};
    save({fields:[...MEM.fields,f]});
    setFF({name:"",type:"ackerbau",crop:"",soil:"",prevCrop:""});setGps({status:"idle",lat:null,lon:null,name:""});
    setModal(null);notify("Feld gespeichert ✓");
  };
  const saveHelper=()=>{
    if(!hForm.name||!hForm.role)return;
    save({helpers:[...MEM.helpers,{...hForm,id:Date.now()}]});
    setHF({name:"",role:"",avatar:"👨‍🌾",color:"#2d6a27"});setModal(null);notify("Helfer hinzugefügt ✓");
  };
  const assignTo=(hid)=>{
    const k=`${activeField?.id}_${assignTask?.id}`;
    save({assignments:{...MEM.assignments,[k]:{helperId:hid,taskId:assignTask?.id,fieldId:activeField?.id,task:assignTask,fieldName:activeField?.name,assignedAt:new Date().toLocaleDateString("de-DE")}}});
    setModal(null);notify(`Delegiert an ${s.helpers.find(h=>h.id===hid)?.name} ✓`);
  };
  const completeTask=(fid,tid)=>{
    const k=`${fid}_${tid}`;
    save({completions:{...MEM.completions,[k]:new Date().toLocaleTimeString("de-DE",{hour:"2-digit",minute:"2-digit"})}});
    notify("Erledigt! ✓");
  };
  const saveNote=(fid)=>{
    if(!noteText.trim())return;
    const k=fid;
    const prev=MEM.notes[k]||[];
    save({notes:{...MEM.notes,[k]:[{text:noteText,time:new Date().toLocaleString("de-DE",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"})},  ...prev].slice(0,20)}});
    setNoteText("");notify("Notiz gespeichert ✓");
  };

  const tk=(fid,tid)=>`${fid}_${tid}`;
  const isDone=(fid,tid)=>!!s.completions[tk(fid,tid)];
  const doneTime=(fid,tid)=>s.completions[tk(fid,tid)];
  const assignee=(fid,tid)=>{const a=s.assignments[tk(fid,tid)];return a?s.helpers.find(h=>h.id===a.helperId):null;};
  const fieldTasks=(fid)=>Object.values(s.assignments).filter(a=>a.fieldId===fid);
  const helperTasks=(h)=>Object.values(s.assignments).filter(a=>a.helperId===h.id);
  const helperDone=(h)=>helperTasks(h).filter(a=>isDone(a.fieldId,a.taskId)).length;

  /* today's weather summary across fields - for dashboard ampel */
  const fieldStatus=(field)=>{
    const ftasks=Object.values(s.assignments).filter(a=>a.fieldId===field.id);
    const done=ftasks.filter(a=>isDone(field.id,a.taskId)).length;
    if(ftasks.length===0)return{color:"#94a3b8",label:"Kein Update"};
    if(done===ftasks.length)return{color:"#16a34a",label:"Alles erledigt"};
    const alerts=ftasks.filter(a=>a.task?.status==="alert"&&!isDone(field.id,a.taskId));
    if(alerts.length)return{color:"#dc2626",label:"Dringende Aufgaben"};
    return{color:"#d97706",label:`${done}/${ftasks.length} erledigt`};
  };

  /* ── UI COMPONENTS ── */
  const C={
    wrap:{fontFamily:FONT,minHeight:"100vh",background:"linear-gradient(155deg,#0a1a0b 0%,#122012 50%,#0d1a0f 100%)",paddingBottom:48},
    card:{background:"rgba(255,255,255,.97)",borderRadius:20,boxShadow:"0 6px 30px rgba(0,0,0,.26)"},
    label:{fontSize:10,fontWeight:700,textTransform:"uppercase",letterSpacing:"1px",color:"#9ca3af",display:"block",marginBottom:7},
    inp:{width:"100%",border:"2px solid #e5e7eb",borderRadius:11,padding:"10px 14px",fontSize:14,fontFamily:FONT,outline:"none",color:"#111"},
  };

  const Chip=({l,a,onClick,sm})=>(
    <button onClick={onClick} style={{cursor:"pointer",border:`2px solid ${a?"#2d6a27":"#e5e7eb"}`,borderRadius:10,padding:sm?"5px 10px":"8px 15px",background:a?"#2d6a27":"white",fontSize:sm?11:13,color:a?"white":"#374151",fontFamily:FONT,fontWeight:a?600:400,transition:"all .15s"}}>
      {l}
    </button>
  );
  const Btn=({ch,onClick,v="p",dis,full,sm,style:sx})=>{
    const vs={p:{background:dis?"#e5e7eb":"linear-gradient(135deg,#2d6a27,#1a4a16)",color:dis?"#9ca3af":"white",boxShadow:dis?"none":"0 4px 18px rgba(45,106,39,.4)"},g:{background:"rgba(255,255,255,.1)",color:"white",border:"1px solid rgba(255,255,255,.2)"},o:{background:"white",color:"#2d6a27",border:"2px solid #2d6a27"},d:{background:"#fee2e2",color:"#dc2626",border:"1.5px solid #fca5a5"}};
    return <button disabled={dis} onClick={onClick} style={{...vs[v],border:vs[v].border||"none",borderRadius:11,padding:sm?"7px 14px":"12px 22px",fontSize:sm?12:15,cursor:dis?"not-allowed":"pointer",fontFamily:FONT,fontWeight:600,transition:"all .2s",width:full?"100%":"auto",opacity:dis?.45:1,...sx}}>{ch}</button>;
  };

  const Modal=({title,onClose,ch})=>(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.65)",backdropFilter:"blur(8px)",zIndex:200,display:"flex",alignItems:"flex-end",justifyContent:"center"}} onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
      <div style={{...C.card,width:"100%",maxWidth:680,maxHeight:"88vh",overflowY:"auto",borderRadius:"22px 22px 0 0",padding:"24px 24px 32px",animation:"fadeUp .3s ease"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
          <div style={{fontFamily:SERIF,fontSize:20,color:"#111",fontWeight:500}}>{title}</div>
          <button onClick={onClose} style={{background:"#f3f4f6",border:"none",borderRadius:8,width:32,height:32,cursor:"pointer",fontSize:15,color:"#6b7280"}}>✕</button>
        </div>
        {ch}
      </div>
    </div>
  );

  const Notif=()=>notif?(
    <div style={{position:"fixed",top:20,left:"50%",transform:"translateX(-50%)",background:notif.t==="ok"?"#14532d":"#7f1d1d",color:"white",borderRadius:12,padding:"10px 22px",fontSize:13,fontFamily:FONT,fontWeight:600,zIndex:400,boxShadow:"0 8px 28px rgba(0,0,0,.35)",animation:"pop .3s ease",whiteSpace:"nowrap"}}>
      {notif.msg}
    </div>
  ):null;

  /* Ampel dot */
  const Dot=({color,pulse})=>(
    <div style={{width:12,height:12,borderRadius:"50%",background:color,flexShrink:0,boxShadow:pulse?`0 0 0 4px ${color}33`:undefined}}/>
  );

  /* ══════ DASHBOARD ══════ */
  if(view==="dash") return(
    <div style={C.wrap}>
      <style>{GS}</style><Notif/>
      {/* Header */}
      <div style={{background:"rgba(0,0,0,.45)",backdropFilter:"blur(16px)",borderBottom:"1px solid rgba(255,255,255,.07)",padding:"15px 20px",position:"sticky",top:0,zIndex:100}}>
        <div style={{maxWidth:700,margin:"0 auto",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div>
            <div style={{fontFamily:SERIF,fontSize:22,color:"white",fontWeight:500,letterSpacing:"-.3px"}}>🌾 FeldKompass</div>
            <div style={{fontSize:11,color:"rgba(255,255,255,.38)",marginTop:1}}>{todayStr()}</div>
          </div>
          <div style={{display:"flex",gap:8}}>
            <Btn ch="+ Helfer" v="g" sm onClick={()=>setModal("addHelper")}/>
            <Btn ch="+ Feld" v="g" sm onClick={()=>setModal("addField")}/>
          </div>
        </div>
      </div>

      <div style={{maxWidth:700,margin:"0 auto",padding:"22px 16px"}}>
        {/* Morning greeting + daily nudge */}
        {s.fields.length>0&&(()=>{
          const hr=new Date().getHours();
          const greet=hr<12?"Guten Morgen":hr<18?"Guten Tag":"Guten Abend";
          const allDone=s.fields.every(f=>{const ft=fieldTasks(f.id);return ft.length>0&&ft.every(a=>isDone(f.id,a.taskId));});
          return(
            <div className="fu" style={{background:"linear-gradient(135deg,rgba(45,106,39,.35),rgba(20,60,18,.4))",border:"1px solid rgba(45,106,39,.35)",borderRadius:16,padding:"16px 20px",marginBottom:18,display:"flex",alignItems:"center",gap:14}}>
              <div style={{fontSize:32}}>🌤️</div>
              <div>
                <div style={{fontFamily:SERIF,fontSize:18,color:"white",fontWeight:500}}>{greet}!</div>
                <div style={{fontSize:13,color:"rgba(255,255,255,.6)",marginTop:2}}>
                  {allDone?"Alle Aufgaben heute erledigt – hervorragende Arbeit! 🎉":"Tippen Sie auf ein Feld für das heutige KI-Update."}
                </div>
              </div>
            </div>
          );
        })()}

        {/* Tabs */}
        <div style={{display:"flex",gap:3,marginBottom:22,background:"rgba(0,0,0,.3)",borderRadius:13,padding:4}}>
          {[["felder","🌾 Felder"],["helfer","👥 Team"],["logbuch","📋 Logbuch"]].map(([k,l])=>(
            <button key={k} onClick={()=>setTab(k)} style={{flex:1,padding:"9px 6px",border:"none",borderRadius:9,cursor:"pointer",fontFamily:FONT,fontSize:13,fontWeight:600,transition:"all .2s",background:tab===k?"rgba(45,106,39,.85)":"transparent",color:tab===k?"white":"rgba(255,255,255,.45)"}}>
              {l}
            </button>
          ))}
        </div>

        {/* ── FELDER TAB ── */}
        {tab==="felder"&&(
          <>
            {/* Stats */}
            {s.fields.length>0&&(
              <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,marginBottom:18}}>
                {[
                  {icon:"🗺️",val:s.fields.length,label:"Felder"},
                  {icon:"✅",val:`${Object.keys(s.completions).length}`,label:"Erledigt heute"},
                  {icon:"👥",val:s.helpers.length,label:"Helfer"},
                ].map(({icon,val,label})=>(
                  <div key={label} style={{...C.card,padding:"14px 12px",textAlign:"center"}} className="fu">
                    <div style={{fontSize:18,marginBottom:3}}>{icon}</div>
                    <div style={{fontFamily:SERIF,fontSize:22,color:"#111",fontWeight:500}}>{val}</div>
                    <div style={{fontSize:10,color:"#9ca3af",fontWeight:600,textTransform:"uppercase",letterSpacing:".6px"}}>{label}</div>
                  </div>
                ))}
              </div>
            )}

            {s.fields.length===0?(
              <div style={{textAlign:"center",color:"rgba(255,255,255,.6)",padding:"56px 0"}}>
                <div style={{fontSize:54,marginBottom:14}}>🗺️</div>
                <div style={{fontFamily:SERIF,fontSize:24,color:"white",marginBottom:10,fontWeight:500}}>Noch keine Felder</div>
                <p style={{fontSize:14,marginBottom:26,maxWidth:300,margin:"0 auto 26px",lineHeight:1.75,color:"rgba(255,255,255,.5)"}}>Legen Sie Ihre Felder an für tägliche KI-Empfehlungen.</p>
                <Btn ch="Erstes Feld anlegen" onClick={()=>setModal("addField")}/>
              </div>
            ):(
              s.fields.map((f,i)=>{
                const fst=fieldStatus(f);
                const ft=fieldTasks(f.id);
                const done=ft.filter(a=>isDone(f.id,a.taskId)).length;
                const pct=ft.length?done/ft.length*100:0;
                return(
                  <div key={f.id} className={`hov fu`} onClick={()=>{setAF(f);setView("field");openField(f);}} style={{...C.card,padding:20,marginBottom:12,cursor:"pointer",borderLeft:`4px solid ${fst.color}`,animationDelay:`${i*.07}s`}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:12}}>
                      <div style={{flex:1}}>
                        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:3}}>
                          <Dot color={fst.color} pulse={fst.color==="dc2626"}/>
                          <div style={{fontFamily:SERIF,fontSize:20,color:"#111",fontWeight:500}}>{f.name}</div>
                        </div>
                        <div style={{fontSize:12,color:"#9ca3af"}}>📍 {f.locationName} · {f.crop} · {f.soil}</div>
                      </div>
                      <div style={{textAlign:"right",flexShrink:0}}>
                        <div style={{fontSize:11,fontWeight:700,color:fst.color,background:`${fst.color}18`,border:`1px solid ${fst.color}33`,borderRadius:20,padding:"3px 10px",whiteSpace:"nowrap"}}>{fst.label}</div>
                      </div>
                    </div>
                    {ft.length>0&&(
                      <div style={{marginTop:12,paddingTop:12,borderTop:"1px solid #f3f4f6"}}>
                        <div style={{display:"flex",alignItems:"center",gap:8}}>
                          <div style={{flex:1,height:5,background:"#e5e7eb",borderRadius:3,overflow:"hidden"}}>
                            <div style={{height:"100%",width:`${pct}%`,background:pct===100?"#16a34a":"#2d6a27",borderRadius:3,transition:"width .5s ease"}}/>
                          </div>
                          <span style={{fontSize:11,color:"#6b7280",fontWeight:500,flexShrink:0}}>{done}/{ft.length} erledigt</span>
                        </div>
                      </div>
                    )}
                    {/* Notes preview */}
                    {s.notes[f.id]?.length>0&&(
                      <div style={{marginTop:10,background:"#fefce8",border:"1px solid #fef08a",borderRadius:8,padding:"6px 10px",fontSize:11,color:"#854d0e"}}>
                        📝 {s.notes[f.id][0].text.slice(0,60)}{s.notes[f.id][0].text.length>60?"…":""}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </>
        )}

        {/* ── HELFER TAB ── */}
        {tab==="helfer"&&(
          <>
            {s.helpers.length===0?(
              <div style={{textAlign:"center",color:"rgba(255,255,255,.6)",padding:"56px 0"}}>
                <div style={{fontSize:54,marginBottom:14}}>👥</div>
                <div style={{fontFamily:SERIF,fontSize:24,color:"white",marginBottom:10}}>Noch kein Team</div>
                <Btn ch="Helfer hinzufügen" onClick={()=>setModal("addHelper")}/>
              </div>
            ):(
              s.helpers.map((h,i)=>{
                const ht=helperTasks(h);const hd=helperDone(h);const pct=ht.length?hd/ht.length*100:0;
                const pending=ht.filter(a=>!isDone(a.fieldId,a.taskId));
                return(
                  <div key={h.id} className="hov fu" onClick={()=>{setAH(h);setModal("helperView");}} style={{...C.card,padding:20,marginBottom:12,cursor:"pointer",borderLeft:`4px solid ${h.color}`,animationDelay:`${i*.07}s`}}>
                    <div style={{display:"flex",gap:14,alignItems:"center"}}>
                      <div style={{width:46,height:46,borderRadius:12,background:`${h.color}18`,border:`2px solid ${h.color}33`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,flexShrink:0}}>{h.avatar}</div>
                      <div style={{flex:1}}>
                        <div style={{fontFamily:SERIF,fontSize:18,color:"#111",fontWeight:500}}>{h.name}</div>
                        <div style={{fontSize:12,color:"#9ca3af"}}>{h.role}</div>
                      </div>
                      <div style={{textAlign:"right"}}>
                        <div style={{fontFamily:SERIF,fontSize:22,color:h.color,fontWeight:500}}>{ht.length}</div>
                        <div style={{fontSize:10,color:"#9ca3af",fontWeight:600,textTransform:"uppercase"}}>Aufgaben</div>
                      </div>
                    </div>
                    {ht.length>0&&(
                      <div style={{marginTop:12,paddingTop:12,borderTop:"1px solid #f3f4f6"}}>
                        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
                          <div style={{flex:1,height:5,background:"#e5e7eb",borderRadius:3,overflow:"hidden"}}>
                            <div style={{height:"100%",width:`${pct}%`,background:h.color,borderRadius:3,transition:"width .5s"}}/>
                          </div>
                          <span style={{fontSize:11,color:"#6b7280"}}>{hd}/{ht.length}</span>
                        </div>
                        {pending.length>0&&<div style={{fontSize:11,color:"#6b7280"}}>Offen: {pending.slice(0,2).map(a=>a.task?.title).join(", ")}{pending.length>2?` +${pending.length-2}`:""}</div>}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </>
        )}

        {/* ── LOGBUCH TAB ── */}
        {tab==="logbuch"&&(
          <>
            <div style={{fontFamily:SERIF,fontSize:18,color:"white",marginBottom:14,fontWeight:500}}>Bewirtschaftungs-Logbuch</div>
            {s.log.length===0?(
              <div style={{textAlign:"center",color:"rgba(255,255,255,.45)",padding:"40px 0",fontSize:14}}>
                Noch keine Einträge. Öffnen Sie ein Feld für das erste KI-Update.
              </div>
            ):(
              s.log.map((e,i)=>(
                <div key={i} className="fu" style={{...C.card,padding:"14px 18px",marginBottom:10,borderLeft:"3px solid #2d6a27",animationDelay:`${i*.04}s`}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8}}>
                    <div>
                      <div style={{fontFamily:SERIF,fontSize:15,color:"#111",fontWeight:500}}>{e.headline}</div>
                      <div style={{fontSize:11,color:"#9ca3af",marginTop:2}}>{e.field} · {e.date}</div>
                    </div>
                    <div style={{fontSize:13,flexShrink:0}}>{e.weather}</div>
                  </div>
                </div>
              ))
            )}
          </>
        )}
      </div>

      {/* ── MODALS ── */}
      {modal==="addField"&&(
        <Modal title="Neues Feld anlegen" onClose={()=>setModal(null)} ch={
          <div style={{display:"flex",flexDirection:"column",gap:16}}>
            <div><label style={C.label}>Feldname</label><input style={C.inp} placeholder="z.B. Nordfeld" value={fForm.name} onChange={e=>setFF(v=>({...v,name:e.target.value}))}/></div>
            <div><label style={C.label}>Kulturtyp</label><div style={{display:"flex",gap:8}}>{[["ackerbau","🌾 Ackerbau"],["gemüse","🥕 Gemüse"]].map(([v,l])=><Chip key={v} l={l} a={fForm.type===v} onClick={()=>setFF(sv=>({...sv,type:v,crop:""}))}/>)}</div></div>
            <div><label style={C.label}>Kultur</label><div style={{display:"flex",flexWrap:"wrap",gap:6}}>{CROPS[fForm.type].map(c=><Chip key={c} l={c} a={fForm.crop===c} onClick={()=>setFF(v=>({...v,crop:c}))} sm/>)}</div></div>
            <div><label style={C.label}>🪱 Bodentyp</label><div style={{display:"flex",flexWrap:"wrap",gap:6}}>{SOILS.map(s2=><Chip key={s2} l={s2} a={fForm.soil===s2} onClick={()=>setFF(v=>({...v,soil:s2}))} sm/>)}</div></div>
            <div><label style={C.label}>🔄 Vorfrucht</label><div style={{display:"flex",flexWrap:"wrap",gap:6}}>{PREV.map(p=><Chip key={p} l={p} a={fForm.prevCrop===p} onClick={()=>setFF(v=>({...v,prevCrop:p}))} sm/>)}</div></div>
            <div>
              <label style={C.label}>📍 GPS-Standort</label>
              {gps.status==="ok"?(
                <div style={{display:"flex",alignItems:"center",gap:10,background:"#f0fdf4",border:"1.5px solid #86efac",borderRadius:11,padding:"10px 14px"}}>
                  <span>📍</span><div style={{flex:1}}><div style={{fontWeight:600,color:"#15803d",fontSize:14}}>{gps.name}</div><div style={{fontSize:11,color:"#9ca3af"}}>{gps.lat?.toFixed(4)}, {gps.lon?.toFixed(4)}</div></div>
                  <Btn ch="Neu" v="o" sm onClick={getGPS}/>
                </div>
              ):<Btn ch={gps.status==="loading"?"⏳ Wird ermittelt…":gps.status==="error"?"⚠️ Fehler – erneut":"📍 GPS-Standort ermitteln"} v="o" full onClick={getGPS} dis={gps.status==="loading"}/>}
            </div>
            <Btn ch="✓ Feld speichern" full dis={!fForm.name||!fForm.crop||!fForm.soil||!fForm.prevCrop||gps.status!=="ok"} onClick={saveField}/>
          </div>
        }/>
      )}
      {modal==="addHelper"&&(
        <Modal title="Helfer hinzufügen" onClose={()=>setModal(null)} ch={
          <div style={{display:"flex",flexDirection:"column",gap:16}}>
            <div style={{display:"flex",gap:12}}>
              <div style={{flex:1}}><label style={C.label}>Name</label><input style={C.inp} placeholder="z.B. Thomas M." value={hForm.name} onChange={e=>setHF(v=>({...v,name:e.target.value}))}/></div>
              <div style={{flex:1}}><label style={C.label}>Rolle</label><input style={C.inp} placeholder="z.B. Traktorfahrer" value={hForm.role} onChange={e=>setHF(v=>({...v,role:e.target.value}))}/></div>
            </div>
            <div><label style={C.label}>Avatar</label><div style={{display:"flex",gap:8}}>{AVATARS.map(a=><button key={a} onClick={()=>setHF(v=>({...v,avatar:a}))} style={{width:42,height:42,fontSize:22,border:`2px solid ${hForm.avatar===a?"#2d6a27":"#e5e7eb"}`,borderRadius:10,cursor:"pointer",background:hForm.avatar===a?"#f0fdf4":"white"}}>{a}</button>)}</div></div>
            <div><label style={C.label}>Farbe</label><div style={{display:"flex",gap:8}}>{COLORS.map(c=><button key={c} onClick={()=>setHF(v=>({...v,color:c}))} style={{width:30,height:30,borderRadius:8,background:c,border:`3px solid ${hForm.color===c?"#111":"transparent"}`,cursor:"pointer"}}/>)}</div></div>
            <Btn ch="✓ Helfer speichern" full dis={!hForm.name||!hForm.role} onClick={saveHelper}/>
          </div>
        }/>
      )}
      {modal==="helperView"&&activeHelper&&(
        <Modal title={`${activeHelper.avatar} ${activeHelper.name}`} onClose={()=>setModal(null)} ch={
          <div>
            <div style={{background:`${activeHelper.color}0f`,border:`1.5px solid ${activeHelper.color}2a`,borderRadius:12,padding:"12px 16px",marginBottom:18}}>
              <div style={{fontSize:13,color:"#6b7280"}}>{activeHelper.role}</div>
              <div style={{display:"flex",gap:16,marginTop:6}}>
                <span style={{fontSize:13,fontWeight:700,color:activeHelper.color}}>{helperTasks(activeHelper).length} Aufgaben gesamt</span>
                <span style={{fontSize:13,color:"#16a34a"}}>✓ {helperDone(activeHelper)} erledigt</span>
              </div>
            </div>
            <div style={C.label}>Aufgaben</div>
            {helperTasks(activeHelper).length===0?<div style={{textAlign:"center",color:"#9ca3af",padding:"24px 0",fontSize:14}}>Noch keine Aufgaben</div>:(
              helperTasks(activeHelper).map(a=>{
                const done=isDone(a.fieldId,a.taskId);const cfg=SS[a.task?.status||"ok"];
                return(
                  <div key={tk(a.fieldId,a.taskId)} style={{background:done?"#f9fafb":cfg.bg,border:`1.5px solid ${done?"#e5e7eb":cfg.border}`,borderRadius:12,padding:"13px 16px",marginBottom:9,opacity:done?.65:1}}>
                    <div style={{display:"flex",alignItems:"center",gap:8}}>
                      <span style={{fontSize:18}}>{a.task?.icon}</span>
                      <div style={{flex:1}}>
                        <div style={{fontFamily:SERIF,fontSize:15,color:done?"#9ca3af":"#111",textDecoration:done?"line-through":"none",fontWeight:500}}>{a.task?.title}</div>
                        <div style={{fontSize:11,color:"#9ca3af"}}>{a.fieldName} · {a.assignedAt}</div>
                      </div>
                      {done?<span style={{fontSize:11,color:"#16a34a",fontWeight:700}}>✓ {doneTime(a.fieldId,a.taskId)}</span>:(
                        <button onClick={()=>completeTask(a.fieldId,a.taskId)} style={{background:"#2d6a27",color:"white",border:"none",borderRadius:8,padding:"5px 12px",fontSize:12,cursor:"pointer",fontFamily:FONT,fontWeight:600}}>Erledigt</button>
                      )}
                    </div>
                    <p style={{margin:"6px 0 0 26px",fontSize:12,color:"#4b5563",lineHeight:1.55}}>{a.task?.detail}</p>
                  </div>
                );
              })
            )}
          </div>
        }/>
      )}
    </div>
  );

  /* ══════ FIELD VIEW ══════ */
  return(
    <div style={C.wrap}>
      <style>{GS}</style><Notif/>
      <div style={{background:"rgba(0,0,0,.45)",backdropFilter:"blur(16px)",borderBottom:"1px solid rgba(255,255,255,.07)",padding:"13px 20px",position:"sticky",top:0,zIndex:100}}>
        <div style={{maxWidth:700,margin:"0 auto",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <button onClick={()=>setView("dash")} style={{background:"rgba(255,255,255,.1)",border:"1px solid rgba(255,255,255,.18)",borderRadius:9,padding:"6px 14px",color:"white",fontSize:13,cursor:"pointer",fontFamily:FONT,fontWeight:600}}>← Zurück</button>
          <div style={{fontFamily:SERIF,fontSize:17,color:"white",fontWeight:500}}>{activeField?.name}</div>
          <button onClick={()=>openField(activeField)} style={{background:"rgba(45,106,39,.55)",border:"1px solid rgba(45,106,39,.7)",borderRadius:9,padding:"6px 14px",color:"white",fontSize:13,cursor:"pointer",fontFamily:FONT,fontWeight:600}}>↻ Neu</button>
        </div>
      </div>

      <div style={{maxWidth:700,margin:"0 auto",padding:"20px 16px"}}>
        {/* Context chips */}
        <div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:16}}>
          {[`📍 ${activeField?.locationName}`,activeField?.crop,activeField?.soil,`Vorfrucht: ${activeField?.prevCrop}`,getSeason()].map(t=>(
            <span key={t} style={{background:"rgba(255,255,255,.1)",borderRadius:20,padding:"3px 10px",fontSize:11,color:"rgba(255,255,255,.65)",fontWeight:500}}>{t}</span>
          ))}
        </div>

        {/* Weather card */}
        {weather&&(
          <div className="fu" style={{background:`linear-gradient(135deg,#142214,#1e3c1a)`,borderRadius:18,padding:20,marginBottom:14,boxShadow:"0 6px 26px rgba(0,0,0,.35)",border:"1px solid rgba(45,106,39,.3)"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div>
                <div style={{fontFamily:SERIF,fontSize:22,color:"white",fontWeight:500}}>{weather.icon} {weather.text}</div>
                <div style={{fontSize:11,color:"rgba(255,255,255,.45)",marginTop:2}}>{activeField?.locationName}</div>
              </div>
              <div style={{textAlign:"right"}}>
                <div style={{fontFamily:SERIF,fontSize:46,color:"white",lineHeight:1,fontWeight:300}}>{weather.temp}°</div>
                <div style={{fontSize:11,color:"rgba(255,255,255,.45)"}}>↑{weather.max}° ↓{weather.min}°</div>
              </div>
            </div>
            <div style={{display:"flex",gap:18,marginTop:14,paddingTop:12,borderTop:"1px solid rgba(255,255,255,.12)"}}>
              {[["🌧️",`${weather.precip} mm`],["💨",`${weather.wind} km/h`],["💧",`${weather.humidity}%`]].map(([ic,v])=>(
                <span key={v} style={{fontSize:13,color:"rgba(255,255,255,.65)"}}>{ic} {v}</span>
              ))}
            </div>
          </div>
        )}

        {/* Loading */}
        {loading&&(
          <div style={{...C.card,padding:"40px 24px",textAlign:"center",marginBottom:14}}>
            <div className="spin" style={{width:34,height:34,border:"3px solid #e5e7eb",borderTopColor:"#2d6a27",borderRadius:"50%",margin:"0 auto 16px"}}/>
            <div style={{color:"#6b7280",fontFamily:SERIF,fontSize:16,fontWeight:300}}>{loadMsg}</div>
          </div>
        )}

        {/* AI Update */}
        {aiData&&!loading&&(
          <>
            {/* Weather warning */}
            {aiData.weatherWarning&&(
              <div className="fu" style={{background:"#fff7ed",border:"2px solid #fdba74",borderRadius:14,padding:"12px 16px",marginBottom:12,display:"flex",gap:10,alignItems:"flex-start"}}>
                <span style={{fontSize:20,flexShrink:0}}>⚠️</span>
                <div style={{fontSize:13,color:"#9a3412",lineHeight:1.6,fontWeight:500}}>{aiData.weatherWarning}</div>
              </div>
            )}

            {/* Headline card */}
            <div className="fu" style={{...C.card,padding:20,marginBottom:12,borderLeft:`4px solid ${PC[aiData.priority]||"#2d6a27"}`}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:8}}>
                <div style={{flex:1}}>
                  <div style={{fontSize:10,fontWeight:700,textTransform:"uppercase",letterSpacing:"1px",color:"#9ca3af",marginBottom:6}}>🤖 KI-Tagesempfehlung</div>
                  <div style={{fontFamily:SERIF,fontSize:22,color:"#111",lineHeight:1.3,fontWeight:500}}>{aiData.headline}</div>
                  {aiData.summary&&<p style={{margin:"6px 0 0",fontSize:13,color:"#6b7280",lineHeight:1.65}}>{aiData.summary}</p>}
                </div>
                <div style={{background:PC[aiData.priority],color:"white",borderRadius:20,padding:"4px 14px",fontSize:11,fontWeight:700,flexShrink:0}}>{aiData.priority} Priorität</div>
              </div>

              {/* Progress bar */}
              {aiData.tasks?.length>0&&(()=>{
                const total=aiData.tasks.length;
                const done=aiData.tasks.filter(t=>isDone(activeField?.id,t.id)).length;
                const pct=done/total*100;
                return(
                  <div style={{marginTop:16,paddingTop:14,borderTop:"1px solid #f3f4f6"}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                      <span style={{fontSize:11,color:"#9ca3af",fontWeight:600,textTransform:"uppercase",letterSpacing:".6px"}}>Tagesfortschritt</span>
                      <span style={{fontSize:13,fontWeight:700,color:pct===100?"#16a34a":"#2d6a27"}}>{done}/{total} erledigt {pct===100?"🎉":""}</span>
                    </div>
                    <div style={{height:8,background:"#e5e7eb",borderRadius:4,overflow:"hidden"}}>
                      <div style={{height:"100%",width:`${pct}%`,background:pct===100?"linear-gradient(90deg,#16a34a,#22c55e)":"linear-gradient(90deg,#2d6a27,#3d8a32)",borderRadius:4,transition:"width .6s ease"}}/>
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Tasks */}
            {aiData.tasks?.map((task,i)=>{
              const cfg=SS[task.status]||SS.ok;
              const done=isDone(activeField?.id,task.id);
              const ass=assignee(activeField?.id,task.id);
              const catIcon=CAT_ICONS[task.category]||"📋";
              return(
                <div key={task.id} className="fu" style={{background:done?"#f8fafc":cfg.bg,border:`1.5px solid ${done?"#e2e8f0":cfg.border}`,borderRadius:15,padding:"16px 18px",marginBottom:10,opacity:done?.6:1,transition:"opacity .4s",animationDelay:`${.1+i*.07}s`}}>
                  <div style={{display:"flex",alignItems:"flex-start",gap:11}}>
                    <span style={{fontSize:22,flexShrink:0,filter:done?"grayscale(1)":"none"}}>{task.icon}</span>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap",marginBottom:4}}>
                        <div style={{fontFamily:SERIF,fontSize:17,color:done?"#94a3b8":"#111",textDecoration:done?"line-through":"none",fontWeight:500}}>{task.title}</div>
                        <span style={{background:done?"#e2e8f0":cfg.badge,color:done?"#94a3b8":"white",borderRadius:7,padding:"2px 8px",fontSize:10,fontWeight:700}}>{done?"Erledigt":cfg.label}</span>
                        {task.duration&&!done&&<span style={{background:"#f1f5f9",borderRadius:7,padding:"2px 8px",fontSize:10,color:"#64748b",fontWeight:600}}>⏱ {task.duration}</span>}
                        <span style={{background:"#f8f8f8",borderRadius:7,padding:"2px 8px",fontSize:10,color:"#9ca3af"}}>{catIcon} {task.category}</span>
                        {done&&<span style={{fontSize:10,color:"#16a34a",fontWeight:600}}>✓ {doneTime(activeField?.id,task.id)}</span>}
                      </div>
                      <p style={{margin:"0 0 10px",fontSize:13,color:done?"#94a3b8":"#4b5563",lineHeight:1.65}}>{task.detail}</p>
                      {ass&&(
                        <div style={{display:"inline-flex",alignItems:"center",gap:5,background:`${ass.color}0f`,border:`1px solid ${ass.color}2a`,borderRadius:20,padding:"3px 10px",fontSize:12,color:ass.color,fontWeight:600,marginBottom:8}}>
                          {ass.avatar} {ass.name}
                        </div>
                      )}
                      {!done&&(
                        <div style={{display:"flex",gap:7,flexWrap:"wrap"}}>
                          <button onClick={()=>completeTask(activeField?.id,task.id)} style={{background:"#2d6a27",color:"white",border:"none",borderRadius:8,padding:"6px 14px",fontSize:12,cursor:"pointer",fontFamily:FONT,fontWeight:600}}>✓ Erledigt</button>
                          {task.assignable&&s.helpers.length>0&&(
                            <button onClick={()=>{setAT(task);setModal("assign");}} style={{background:"white",color:"#2d6a27",border:"2px solid #2d6a27",borderRadius:8,padding:"6px 14px",fontSize:12,cursor:"pointer",fontFamily:FONT,fontWeight:600}}>👤 Delegieren</button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Outlook */}
            {aiData.outlook&&(
              <div className="fu" style={{...C.card,padding:"16px 20px",borderLeft:"3px solid #d1d5db",marginBottom:14}}>
                <div style={{fontSize:10,fontWeight:700,textTransform:"uppercase",letterSpacing:"1px",color:"#9ca3af",marginBottom:6}}>📅 Ausblick</div>
                <p style={{margin:0,fontSize:14,color:"#4b5563",lineHeight:1.7,fontStyle:"italic",fontFamily:SERIF,fontWeight:300}}>{aiData.outlook}</p>
              </div>
            )}

            {/* ── SCHNELL-NOTIZEN ── */}
            <div className="fu" style={{...C.card,padding:"18px 20px",marginBottom:14}}>
              <div style={{fontSize:10,fontWeight:700,textTransform:"uppercase",letterSpacing:"1px",color:"#9ca3af",marginBottom:10}}>📝 Feldnotiz hinzufügen</div>
              <div style={{display:"flex",gap:8}}>
                <input value={noteText} onChange={e=>setNoteText(e.target.value)} placeholder="z.B. Schädlingsbefall bemerkt, Bodenfeuchte tief…" style={{...C.inp,flex:1}} onKeyDown={e=>e.key==="Enter"&&saveNote(activeField?.id)}/>
                <Btn ch="Speichern" v="o" sm onClick={()=>saveNote(activeField?.id)} dis={!noteText.trim()}/>
              </div>
              {s.notes[activeField?.id]?.length>0&&(
                <div style={{marginTop:12,display:"flex",flexDirection:"column",gap:6}}>
                  {s.notes[activeField?.id].map((n,i)=>(
                    <div key={i} style={{background:"#fefce8",border:"1px solid #fef08a",borderRadius:8,padding:"7px 11px",fontSize:12,color:"#713f12",display:"flex",justifyContent:"space-between",gap:8}}>
                      <span>{n.text}</span>
                      <span style={{color:"#a16207",flexShrink:0,fontSize:10}}>{n.time}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{textAlign:"center",color:"rgba(255,255,255,.2)",fontSize:10,marginTop:4}}>
              Echtzeit-Wetterdaten · KI-Analyse · {todayStr()}
            </div>
          </>
        )}
      </div>

      {/* Assign Modal */}
      {modal==="assign"&&assignTask&&(
        <Modal title="Aufgabe delegieren" onClose={()=>setModal(null)} ch={
          <div>
            <div style={{background:"#f8fafc",borderRadius:12,padding:"12px 16px",marginBottom:16}}>
              <div style={{fontFamily:SERIF,fontSize:16,color:"#111",fontWeight:500}}>{assignTask.icon} {assignTask.title}</div>
              <p style={{margin:"4px 0 0",fontSize:12,color:"#6b7280",lineHeight:1.55}}>{assignTask.detail}</p>
            </div>
            <div style={C.label}>Helfer auswählen</div>
            {s.helpers.map(h=>(
              <div key={h.id} onClick={()=>assignTo(h.id)} style={{display:"flex",alignItems:"center",gap:14,padding:"14px 16px",border:`2px solid ${h.color}22`,borderRadius:13,marginBottom:8,cursor:"pointer",transition:"all .15s",background:`${h.color}06`}}
                onMouseEnter={e=>e.currentTarget.style.background=`${h.color}14`}
                onMouseLeave={e=>e.currentTarget.style.background=`${h.color}06`}>
                <div style={{width:38,height:38,borderRadius:10,background:`${h.color}18`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20}}>{h.avatar}</div>
                <div style={{flex:1}}>
                  <div style={{fontFamily:SERIF,fontSize:16,color:"#111",fontWeight:500}}>{h.name}</div>
                  <div style={{fontSize:11,color:"#9ca3af"}}>{h.role} · {helperTasks(h).length} Aufgaben</div>
                </div>
                <span style={{fontSize:18,color:h.color}}>→</span>
              </div>
            ))}
          </div>
        }/>
      )}
    </div>
  );
}
