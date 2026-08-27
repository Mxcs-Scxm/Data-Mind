import { useState, useRef, useCallback } from "react";

const T = {
  bg:"#f4f6fa", surface:"#ffffff", surfaceL:"#f8f9fc",
  border:"#e3e8ef", borderD:"#d0d7e3",
  primary:"#2563eb", primaryL:"#eff6ff", primaryG:"linear-gradient(135deg,#2563eb,#4f46e5)",
  accent:"#4f46e5",
  text:"#111827", textM:"#374151", textD:"#6b7280", textL:"#9ca3af",
  green:"#059669", greenL:"#ecfdf5",
  cyan:"#0891b2", cyanL:"#ecfeff",
  amber:"#d97706", amberL:"#fffbeb",
  red:"#dc2626", redL:"#fef2f2",
  purple:"#7c3aed", purpleL:"#f5f3ff",
  teal:"#0d9488", tealL:"#f0fdfa",
};

const MISTRAL_MODEL = "mistral-medium";
const NEWSAPI_ENDPOINT = "https://newsapi.org/v2/everything";

async function callMistral(content, { maxTokens = 2000, idleMs = 25000, hardMs = 90000, onDelta } = {}) {
  const attempt = async (tokens) => {
    const controller = new AbortController();
    let idleTimer;
    const armIdleTimer = () => {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => controller.abort(), idleMs);
    };
    const hardTimer = setTimeout(() => controller.abort(), hardMs);

    armIdleTimer();
    let res;
    try {
      // ✅✅✅ CORRECTION : Utilise le proxy /api/mistral
      res = await fetch(`/api/mistral/v1/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // ✅ Plus besoin de Bearer ici, le proxy l'ajoute !
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: MISTRAL_MODEL,
          max_tokens: tokens,
          stream: true,
          messages: [{ role: "user", content }],
        }),
      });
    } catch (err) {
      clearTimeout(idleTimer);
      clearTimeout(hardTimer);
      throw err;
    }

    if (!res.ok || !res.body) {
      clearTimeout(idleTimer);
      clearTimeout(hardTimer);
      const errBody = await res.text().catch(() => "");
      if (res.status === 401 || res.status === 403) {
        throw new Error("❌ Erreur d'authentification Mistral : vérifie ta clé API dans .env");
      }
      throw new Error(`❌ Erreur Mistral ${res.status}: ${errBody.slice(0, 200)}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let full = "";
    let buf = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        armIdleTimer();
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop();
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          if (!data || data === "[DONE]") continue;
          try {
            const evt = JSON.parse(data);
            if (evt.choices?.[0]?.delta?.content) {
              full += evt.choices[0].delta.content;
              onDelta?.(full);
            }
          } catch {
            // ignore malformed SSE
          }
        }
      }
    } finally {
      clearTimeout(idleTimer);
      clearTimeout(hardTimer);
    }
    return full;
  };

  try {
    return await attempt(maxTokens);
  } catch (err) {
    const isAbort = err.name === "AbortError";
    if (!isAbort) throw err;
    const reducedTokens = Math.max(400, Math.floor(maxTokens * 0.5));
    return await attempt(reducedTokens);
  }
}

const AUTO_CONNECTORS = [
  {id:"mistral",    icon:"🧠", name:"Mistral AI",  desc:"Core inference · reasoning · synthesis · deep analysis", color:T.accent},
  {id:"websearch", icon:"🔍", name:"Web Search — Real-time", desc:"Live web retrieval · news · reports · market data",      color:T.cyan},
  {id:"filedoc",   icon:"📄", name:"Document Parser",        desc:"PDF · Excel · CSV · PPTX · JSON · image OCR",            color:T.teal},
  {id:"translate", icon:"🌐", name:"Multilingual Engine",    desc:"FR · EN · AR · ES · ZH — analysis in any language",     color:T.green},
];

const MANUAL_CONNECTORS = [
  {id:"newsapi",   icon:"📰", name:"NewsAPI",       cat:"News",     color:T.amber,   desc:"150,000+ global news sources", fields:[{k:"apiKey",l:"API Key",p:"newsapi.org key",t:"password"}], link:"https://newsapi.org"},
  {id:"instagram", icon:"📸", name:"Instagram",     cat:"Social",   color:"#e1306c", desc:"Meta Graph API · Business",    fields:[{k:"token",l:"Access Token",p:"Meta Graph API Token",t:"password"},{k:"accountId",l:"Account ID",p:"Business ID",t:"text"}], link:"https://developers.facebook.com"},
  {id:"twitter",   icon:"🐦", name:"X / Twitter",   cat:"Social",   color:"#1d9bf0", desc:"Twitter API v2 · analytics",   fields:[{k:"bearer",l:"Bearer Token",p:"Twitter API v2 bearer",t:"password"}], link:"https://developer.twitter.com"},
  {id:"linkedin",  icon:"💼", name:"LinkedIn",       cat:"Social",   color:"#0a66c2", desc:"Posts · analytics · company",  fields:[{k:"token",l:"Access Token",p:"LinkedIn OAuth token",t:"password"},{k:"orgId",l:"Org ID",p:"Organization ID",t:"text"}], link:"https://developer.linkedin.com"},
  {id:"gdrive",    icon:"📁", name:"Google Drive",   cat:"Cloud",    color:"#16a34a", desc:"Docs · Sheets · Slides",       fields:[{k:"token",l:"OAuth Token",p:"Google OAuth2 token",t:"password"}], link:"https://console.cloud.google.com"},
  {id:"dropbox",   icon:"📦", name:"Dropbox",        cat:"Cloud",    color:"#0061ff", desc:"File access · Dropbox API",    fields:[{k:"token",l:"Access Token",p:"Dropbox API token",t:"password"}], link:"https://www.dropbox.com/developers"},
  {id:"snowflake", icon:"❄️", name:"Snowflake",      cat:"Database", color:"#29b5e8", desc:"Cloud data warehouse · SQL",   fields:[{k:"account",l:"Account",p:"xxx.snowflakecomputing.com",t:"text"},{k:"user",l:"User",p:"username",t:"text"},{k:"token",l:"Token",p:"Auth token",t:"password"},{k:"db",l:"Database",p:"MY_DB",t:"text"}], link:"https://www.snowflake.com"},
  {id:"postgresql",icon:"🐘", name:"PostgreSQL",     cat:"Database", color:"#336791", desc:"Relational DB · proxy query",  fields:[{k:"host",l:"Host",p:"localhost:5432",t:"text"},{k:"db",l:"Database",p:"db_name",t:"text"},{k:"user",l:"User",p:"postgres",t:"text"},{k:"pw",l:"Password",p:"••••••",t:"password"}], link:"https://www.postgresql.org"},
  {id:"powerbi",   icon:"📊", name:"Power BI",       cat:"BI",       color:"#f2c811", desc:"Reports · datasets",           fields:[{k:"token",l:"Azure AD Token",p:"Azure token",t:"password"},{k:"workspace",l:"Workspace ID",p:"Workspace ID",t:"text"}], link:"https://app.powerbi.com"},
  {id:"looker",    icon:"🔭", name:"Looker Studio",  cat:"BI",       color:"#4285f4", desc:"Embedded reports",             fields:[{k:"url",l:"Report URL",p:"https://lookerstudio.google.com/...",t:"text"}], link:"https://lookerstudio.google.com"},
];
const ANALYSIS_TYPES = ["Business","Geopolitical","Financial","Market","Technology","HR & Social","Strategic","Scientific"];
const HORIZONS = ["Real-time","Short-term 0-3M","Mid-term 3-18M","Long-term 18M+","Multi-horizon"];
const DEPTHS = ["Executive Brief","Standard","Deep Analysis","Full Research"];
const GUIDING_QS = [
  {id:"context",    icon:"🎯", label:"Context",      q:"What is your organizational context?",            p:"e.g. I'm Chief Strategy Officer at a European retail group...", h:"Your role, organization, sector, scale."},
  {id:"objective",  icon:"🏆", label:"Objective",    q:"What decision does this analysis need to inform?", p:"e.g. Board expects go/no-go on Moroccan entry in 3 weeks...", h:"The concrete action or decision post-analysis."},
  {id:"scope",      icon:"🗺️", label:"Scope",        q:"Define the geographic and sectoral perimeter.",   p:"e.g. Morocco, Tunisia — food retail, urban middle-class...", h:"Geographies, market segments, product lines."},
  {id:"kpis",       icon:"📊", label:"KPIs",         q:"Which metrics and indicators matter most?",       p:"e.g. TAM, CAC, payback period, regulatory risk, FX...", h:"Numbers you'll be held accountable for."},
  {id:"constraints",icon:"⚡", label:"Constraints",  q:"What are your hard constraints?",                 p:"e.g. No public JV, halal required, capex < 5M...", h:"Budget, timeline, legal, political limits."},
  {id:"known",      icon:"💡", label:"Prior Intel",  q:"What intelligence do you already have?",          p:"e.g. Carrefour already present in Morocco...", h:"Avoid re-stating what you already know."},
  {id:"format",     icon:"📋", label:"Output",       q:"What exact deliverable do you need?",             p:"e.g. 2-page board brief + detailed annex with financials...", h:"Audience, depth, format, usage."},
];
const OUTLETS = [
  {id:"reuters", name:"Reuters", icon:"🌐", domain:"reuters.com", cat:"INT"},
  {id:"bloomberg", name:"Bloomberg", icon:"🌐", domain:"bloomberg.com", cat:"INT"},
  {id:"apnews", name:"AP News", icon:"🌐", domain:"apnews.com", cat:"INT"},
  {id:"ft", name:"Financial Times", icon:"🌐", domain:"ft.com", cat:"INT"},
  {id:"economist", name:"The Economist", icon:"🌐", domain:"economist.com", cat:"INT"},
  {id:"foreignaff", name:"Foreign Affairs", icon:"🌐", domain:"foreignaffairs.com", cat:"INT"},
  {id:"lemonde", name:"Le Monde", icon:"🇫🇷", domain:"lemonde.fr", cat:"FR"},
  {id:"lefigaro", name:"Le Figaro", icon:"🇫🇷", domain:"lefigaro.fr", cat:"FR"},
  {id:"lesechos", name:"Les Echos", icon:"🇫🇷", domain:"lesechos.fr", cat:"FR"},
];
const OUTLET_CATS = ["INT","FR","UK","USA","DE","ES","IT","RU","CN","JP","IN","ME","LATAM","AU","CA"];
const SRC_COLORS = {websearch:T.cyan, newsapi:T.amber, instagram:"#e1306c", twitter:"#1d9bf0", linkedin:"#0a66c2", file:T.teal, url:T.purple, scholar:T.purple};

const Label = ({children, color=T.textD, style={}}) => (
  <div style={{fontSize:10.5,fontWeight:700,letterSpacing:1,textTransform:"uppercase",color,...style}}>{children}</div>
);
const Tag = ({label, color=T.primary, onRemove, xs}) => (
  <span style={{display:"inline-flex",alignItems:"center",gap:3,background:`${color}14`,color,border:`1px solid ${color}30`,borderRadius:4,padding:xs?"2px 7px":"3px 10px",fontSize:xs?10:11,fontWeight:600,whiteSpace:"nowrap"}}>
    {label}{onRemove&&<button onClick={onRemove} style={{background:"none",border:"none",color,cursor:"pointer",fontSize:12,padding:0,lineHeight:1,marginLeft:2,opacity:.6}}>x</button>}
  </span>
);
const Dot = ({color=T.green,pulse}) => (
  <span style={{position:"relative",display:"inline-flex",width:8,height:8,alignItems:"center",justifyContent:"center"}}>
    <span style={{width:8,height:8,borderRadius:"50%",background:color,display:"block"}}/>
    {pulse&&<span style={{position:"absolute",width:14,height:14,borderRadius:"50%",border:`1.5px solid ${color}`,animation:"ping 2s infinite",opacity:.3}}/>}
  </span>
);
const Divider = ({label}) => (
  <div style={{display:"flex",alignItems:"center",gap:12,margin:"20px 0 14px"}}>
    <div style={{flex:1,height:1,background:T.border}}/>
    {label&&<Label>{label}</Label>}
    <div style={{flex:1,height:1,background:T.border}}/>
  </div>
);

const Btn = ({onClick,disabled,children,variant="primary",small,full,style={}}) => {
  const base={border:"none",borderRadius:6,fontWeight:600,cursor:disabled?"not-allowed":"pointer",fontFamily:"inherit",transition:"all .15s",fontSize:small?12:13,...style};
  const pad=small?"6px 14px":"10px 20px";
  if(variant==="primary") return <button onClick={onClick} disabled={disabled} style={{...base,padding:pad,width:full?"100%":"auto",background:disabled?"#e5e7eb":T.primaryG,color:disabled?T.textL:"#fff",boxShadow:disabled?"none":"0 1px 8px #2563eb25"}}>{children}</button>;
  if(variant==="ghost")   return <button onClick={onClick} disabled={disabled} style={{...base,padding:pad,background:"transparent",color:T.textD,border:`1.5px solid ${T.border}`}}>{children}</button>;
  if(variant==="accent")  return <button onClick={onClick} disabled={disabled} style={{...base,padding:pad,background:T.accent,color:"#fff",boxShadow:"0 1px 8px #4f46e525"}}>{children}</button>;
  return <button onClick={onClick} disabled={disabled} style={{...base,padding:pad,background:T.surfaceL,color:T.textM,border:`1px solid ${T.border}`}}>{children}</button>;
};

const Input = ({value,onChange,placeholder,type="text",onEnter}) => (
  <input value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} type={type}
    onKeyDown={e=>e.key==="Enter"&&onEnter&&onEnter()}
    style={{width:"100%",padding:"9px 12px",borderRadius:6,border:`1.5px solid ${T.border}`,background:T.surface,fontSize:13,outline:"none",fontFamily:"inherit",boxSizing:"border-box",color:T.text}}/>
);

const Toggle = ({options,selected,onToggle,color=T.primary,single}) => (
  <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
    {options.map((o,i)=>{
      const on=selected.includes(i);
      return <button key={i} onClick={()=>{if(single){onToggle([i]);}else{onToggle(on&&selected.length>1?selected.filter(x=>x!==i):[...selected.filter(x=>x!==i),i]);}}}
        style={{padding:"5px 13px",borderRadius:20,border:`1.5px solid ${on?color:T.border}`,background:on?color:T.surface,color:on?"#fff":T.textM,cursor:"pointer",fontSize:12,fontWeight:600,fontFamily:"inherit",transition:"all .12s"}}>
        {o}
      </button>;
    })}
  </div>
);

const Card = ({children,accent,style={}}) => (
  <div style={{background:T.surface,borderRadius:8,border:`1.5px solid ${T.border}`,padding:16,borderLeft:accent?`3px solid ${accent}`:"1.5px solid "+T.border,...style}}>{children}</div>
);

const SectionBlock = ({icon,title,color,children,open:defOpen=true}) => {
  const [open,setOpen]=useState(defOpen);
  return (
    <div style={{marginBottom:10,borderRadius:8,border:`1.5px solid ${T.border}`,overflow:"hidden"}}>
      <div onClick={()=>setOpen(o=>!o)} style={{display:"flex",alignItems:"center",gap:10,padding:"11px 16px",background:T.surfaceL,cursor:"pointer",userSelect:"none",borderLeft:`3px solid ${color}`}}>
        <span style={{fontSize:15}}>{icon}</span>
        <span style={{fontWeight:700,color:T.text,fontSize:13,flex:1}}>{title}</span>
        <span style={{color:T.textL,fontSize:10,fontWeight:600}}>{open?"▲ Collapse":"▼ Expand"}</span>
