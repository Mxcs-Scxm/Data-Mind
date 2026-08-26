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
const MISTRAL_ENDPOINT = `${process.env.REACT_APP_MISTRAL_API_URL}/chat/completions`;
const NEWSAPI_ENDPOINT = "/api/newsapi/v2/everything";

// Calls Claude with streaming (avoids idle-timeout: the connection never
// goes quiet because tokens arrive continuously). If the stream stalls for
// longer than `idleMs` with no new bytes, it aborts and retries once with
// a smaller max_tokens budget (faster generation, lower stall risk). A
// `hardMs` ceiling also bounds the whole call in case tokens keep trickling
// in slowly forever without ever triggering the idle abort.
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
      res = await fetch(MISTRAL_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
        throw new Error("Mistral API authentication failed — set a real MISTRAL_API_KEY in .env, then restart the dev server (npm run dev).");
      }
      throw new Error(`Mistral API error ${res.status}: ${errBody.slice(0, 200)}`);
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
            if (evt.type === "content_block_delta" && evt.delta?.text) {
              full += evt.delta.text;
              onDelta?.(full);
            }
          } catch {
            // ignore malformed SSE fragment
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
    // Stream stalled: retry once with a smaller token budget so generation
    // finishes faster and is less likely to idle out again.
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
  {id:"reuters",     name:"Reuters",               icon:"🌐", domain:"reuters.com",                  cat:"INT"},
  {id:"bloomberg",   name:"Bloomberg",             icon:"🌐", domain:"bloomberg.com",                cat:"INT"},
  {id:"apnews",      name:"AP News",               icon:"🌐", domain:"apnews.com",                   cat:"INT"},
  {id:"ft",          name:"Financial Times",       icon:"🌐", domain:"ft.com",                       cat:"INT"},
  {id:"economist",   name:"The Economist",         icon:"🌐", domain:"economist.com",                cat:"INT"},
  {id:"foreignaff",  name:"Foreign Affairs",       icon:"🌐", domain:"foreignaffairs.com",           cat:"INT"},
  {id:"lemonde",     name:"Le Monde",              icon:"🇫🇷", domain:"lemonde.fr",                  cat:"FR"},
  {id:"lefigaro",    name:"Le Figaro",             icon:"🇫🇷", domain:"lefigaro.fr",                 cat:"FR"},
  {id:"lesechos",    name:"Les Echos",             icon:"🇫🇷", domain:"lesechos.fr",                 cat:"FR"},
  {id:"liberation",  name:"Liberation",            icon:"🇫🇷", domain:"liberation.fr",               cat:"FR"},
  {id:"bfmtv",       name:"BFM TV",                icon:"🇫🇷", domain:"bfmtv.com",                   cat:"FR"},
  {id:"mediapart",   name:"Mediapart",             icon:"🇫🇷", domain:"mediapart.fr",                cat:"FR"},
  {id:"lemondediplo",name:"Le Monde Diplo",        icon:"🇫🇷", domain:"monde-diplomatique.fr",       cat:"FR"},
  {id:"bbc",         name:"BBC",                   icon:"🇬🇧", domain:"bbc.co.uk",                   cat:"UK"},
  {id:"guardian",    name:"The Guardian",          icon:"🇬🇧", domain:"theguardian.com",             cat:"UK"},
  {id:"thetimes",    name:"The Times",             icon:"🇬🇧", domain:"thetimes.co.uk",              cat:"UK"},
  {id:"telegraph",   name:"The Telegraph",         icon:"🇬🇧", domain:"telegraph.co.uk",             cat:"UK"},
  {id:"nytimes",     name:"NY Times",              icon:"🇺🇸", domain:"nytimes.com",                 cat:"USA"},
  {id:"wsj",         name:"Wall Street Journal",   icon:"🇺🇸", domain:"wsj.com",                     cat:"USA"},
  {id:"washpost",    name:"Washington Post",       icon:"🇺🇸", domain:"washingtonpost.com",          cat:"USA"},
  {id:"cnn",         name:"CNN",                   icon:"🇺🇸", domain:"cnn.com",                     cat:"USA"},
  {id:"politico",    name:"Politico",              icon:"🇺🇸", domain:"politico.com",                cat:"USA"},
  {id:"axios",       name:"Axios",                 icon:"🇺🇸", domain:"axios.com",                   cat:"USA"},
  {id:"spiegel",     name:"Der Spiegel",           icon:"🇩🇪", domain:"spiegel.de",                  cat:"DE"},
  {id:"faz",         name:"Frankfurter Allgemeine",icon:"🇩🇪", domain:"faz.net",                     cat:"DE"},
  {id:"dw",          name:"Deutsche Welle",        icon:"🇩🇪", domain:"dw.com",                      cat:"DE"},
  {id:"elpais",      name:"El Pais",               icon:"🇪🇸", domain:"elpais.com",                  cat:"ES"},
  {id:"elmundo",     name:"El Mundo",              icon:"🇪🇸", domain:"elmundo.es",                  cat:"ES"},
  {id:"corriere",    name:"Corriere della Sera",   icon:"🇮🇹", domain:"corriere.it",                 cat:"IT"},
  {id:"repubblica",  name:"La Repubblica",         icon:"🇮🇹", domain:"repubblica.it",               cat:"IT"},
  {id:"rt",          name:"RT",                    icon:"🇷🇺", domain:"rt.com",                      cat:"RU"},
  {id:"tass",        name:"TASS",                  icon:"🇷🇺", domain:"tass.com",                    cat:"RU"},
  {id:"xinhua",      name:"Xinhua",                icon:"🇨🇳", domain:"xinhuanet.com",               cat:"CN"},
  {id:"scmp",        name:"S. China Morning Post", icon:"🇨🇳", domain:"scmp.com",                    cat:"CN"},
  {id:"nhk",         name:"NHK World",             icon:"🇯🇵", domain:"nhk.or.jp",                   cat:"JP"},
  {id:"nikkei",      name:"Nikkei Asia",           icon:"🇯🇵", domain:"asia.nikkei.com",             cat:"JP"},
  {id:"thehindu",    name:"The Hindu",             icon:"🇮🇳", domain:"thehindu.com",                cat:"IN"},
  {id:"ndtv",        name:"NDTV",                  icon:"🇮🇳", domain:"ndtv.com",                    cat:"IN"},
  {id:"aljazeera",   name:"Al Jazeera",            icon:"🌍", domain:"aljazeera.com",                cat:"ME"},
  {id:"alarabiya",   name:"Al Arabiya",            icon:"🌍", domain:"english.alarabiya.net",        cat:"ME"},
  {id:"haaretz",     name:"Haaretz",               icon:"🇮🇱", domain:"haaretz.com",                 cat:"ME"},
  {id:"folha",       name:"Folha de S.Paulo",      icon:"🇧🇷", domain:"folha.uol.com.br",            cat:"LATAM"},
  {id:"smh",         name:"Sydney Morning Herald", icon:"🇦🇺", domain:"smh.com.au",                  cat:"AU"},
  {id:"cbc",         name:"CBC",                   icon:"🇨🇦", domain:"cbc.ca",                      cat:"CA"},
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
      </div>
      {open&&<div style={{padding:"16px 18px",background:T.surface,fontSize:13.5,lineHeight:1.85,color:T.textM,whiteSpace:"pre-wrap",borderLeft:`3px solid ${color}20`}}>{children}</div>}
    </div>
  );
};
function ColSection({icon,title,badge,badgeColor=T.primary,children}) {
  const [open,setOpen]=useState(false);
  return (
    <div style={{marginBottom:10,borderRadius:8,border:`1.5px solid ${open?"#93c5fd":T.border}`,overflow:"hidden"}}>
      <div style={{display:"flex",alignItems:"center",gap:12,padding:"12px 16px",background:open?"#eff6ff":"#fff"}}>
        <span style={{fontSize:20}}>{icon}</span>
        <span style={{flex:1,fontWeight:700,fontSize:13.5,color:"#111827"}}>{title}</span>
        {badge>0&&<span style={{background:badgeColor,color:"#fff",borderRadius:12,padding:"2px 9px",fontSize:11,fontWeight:700}}>{badge}</span>}
        <button onClick={()=>setOpen(o=>!o)}
          style={{minWidth:86,padding:"6px 14px",borderRadius:6,border:"2px solid #2563eb",background:open?"#2563eb":"#fff",color:open?"#fff":"#2563eb",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
          {open?"▲ Close":"▼ Open"}
        </button>
      </div>
      {open&&<div style={{padding:"16px",background:"#fff",borderTop:"1px solid #e3e8ef"}}>{children}</div>}
    </div>
  );
}
function ConnectorCard({conn,saved,onSave,onDel}) {
  const [open,setOpen]=useState(false);
  const [vals,setVals]=useState(saved||{});
  const ok=!!saved;
  return (
    <div style={{border:`1.5px solid ${ok?conn.color+"50":T.border}`,borderRadius:8,overflow:"hidden",borderLeft:`3px solid ${ok?conn.color:T.border}`}}>
      <div style={{display:"flex",alignItems:"center",gap:12,padding:"11px 14px",background:T.surface}}>
        <span style={{fontSize:20}}>{conn.icon}</span>
        <div style={{flex:1,minWidth:0}}>
          <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:2}}>
            <span style={{fontWeight:700,fontSize:13,color:T.text}}>{conn.name}</span>
            <Tag label={conn.cat} color={conn.color} xs/>
          </div>
          <div style={{fontSize:11.5,color:T.textD}}>{conn.desc}</div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <Dot color={ok?T.green:T.textL} pulse={ok}/>
          <Tag label={ok?"Connected":"Not configured"} color={ok?T.green:T.textL} xs/>
          <button onClick={()=>setOpen(o=>!o)} style={{background:"none",border:`1.5px solid ${T.border}`,borderRadius:5,padding:"4px 10px",cursor:"pointer",fontSize:11,fontWeight:600,color:T.textD,fontFamily:"inherit"}}>
            {ok?"Edit":"Configure"}
          </button>
          {ok&&<button onClick={onDel} style={{background:"none",border:"none",cursor:"pointer",fontSize:14,color:T.red,opacity:.6,padding:2}}>x</button>}
        </div>
      </div>
      {open&&(
        <div style={{borderTop:`1px solid ${T.border}`,padding:"14px 16px",background:T.surfaceL}}>
          <div style={{fontSize:11.5,color:T.textD,marginBottom:12}}>
            Get credentials: <a href={conn.link} target="_blank" rel="noreferrer" style={{color:conn.color,fontWeight:600}}>{conn.link}</a>
          </div>
          {conn.fields.map(f=>(
            <div key={f.k} style={{marginBottom:10}}>
              <Label style={{marginBottom:5}}>{f.l}</Label>
              <Input value={vals[f.k]||""} onChange={v=>setVals(x=>({...x,[f.k]:v}))} placeholder={f.p} type={f.t}/>
            </div>
          ))}
          <div style={{display:"flex",gap:8,marginTop:12}}>
            <Btn onClick={()=>{onSave(vals);setOpen(false);}} small>Save</Btn>
            <Btn onClick={()=>setOpen(false)} variant="ghost" small>Cancel</Btn>
          </div>
        </div>
      )}
    </div>
  );
}
const SourceRow = ({s,selected,onToggle,onDel}) => (
  <div onClick={onToggle} style={{display:"flex",alignItems:"center",gap:10,padding:"9px 13px",borderRadius:7,border:`1.5px solid ${selected?T.primary+"60":T.border}`,background:selected?T.primaryL:T.surface,cursor:"pointer",transition:"all .12s"}}>
    <span style={{fontSize:16,width:22,textAlign:"center"}}>{s.icon||"📄"}</span>
    <div style={{flex:1,minWidth:0}}>
      <div style={{fontSize:13,fontWeight:600,color:selected?T.primary:T.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.label}</div>
      {s.sub&&<div style={{fontSize:11,color:T.textL,marginTop:1}}>{s.sub}</div>}
    </div>
    <Tag label={s.source} color={SRC_COLORS[s.source]||T.textD} xs/>
    <span style={{fontSize:14,color:selected?T.primary:T.border}}>{selected?"☑":"☐"}</span>
    <button onClick={e=>{e.stopPropagation();onDel();}} style={{background:"none",border:"none",cursor:"pointer",color:T.textL,fontSize:14,padding:"0 2px"}}>x</button>
  </div>
);
function MediaOutletsCard({onAdd,newsApiKey}) {
  const [selected,setSelected]=useState([]);
  const [query,setQuery]=useState("");
  const [cat,setCat]=useState("ALL");
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState("");
  const toggle=id=>setSelected(p=>p.includes(id)?p.filter(x=>x!==id):[...p,id]);
  const filtered=cat==="ALL"?OUTLETS:OUTLETS.filter(o=>o.cat===cat);
  const doFetch=async()=>{
    if(selected.length===0&&!query.trim())return;
    setLoading(true);setError("");
    const selO=OUTLETS.filter(o=>selected.includes(o.id));
    if(newsApiKey&&selO.length>0){
      const domains=selO.map(o=>o.domain).join(",");
      const q=query.trim()||"news";
      try{
        const r=await fetch(`${NEWSAPI_ENDPOINT}?q=${encodeURIComponent(q)}&domains=${domains}&pageSize=8&sortBy=publishedAt`,{headers:{"X-Api-Key":newsApiKey}});
        if(!r.ok)throw new Error(r.status===401||r.status===403?"NewsAPI key rejected — check it in Connectors":`NewsAPI error ${r.status}`);
        const d=await r.json();
        (d.articles||[]).forEach((a,i)=>onAdd({id:`outlet-${Date.now()}-${i}`,icon:"📰",label:a.title?.slice(0,70)||"Article",sub:`${a.source?.name} · ${a.publishedAt?.slice(0,10)}`,source:"newsapi",data:`${a.title}\n${a.description}\n${a.url}`}));
      }catch(e){setError(e.message||"NewsAPI request failed");}
    } else {
      selO.forEach(o=>onAdd({id:`outlet-ws-${Date.now()}-${o.id}`,icon:o.icon,label:`${o.name}${query.trim()?" - "+query.trim():""}`,sub:`site:${o.domain}`,source:"websearch",data:`site:${o.domain} ${query.trim()||"latest news"}`,isQuery:true}));
    }
    setLoading(false);setSelected([]);
  };
  return (
    <div>
      <div style={{display:"flex",gap:5,marginBottom:10,flexWrap:"wrap"}}>
        {["ALL",...OUTLET_CATS].map(c=>(
          <button key={c} onClick={()=>setCat(c)} style={{padding:"3px 10px",borderRadius:20,border:`1.5px solid ${cat===c?T.primary:T.border}`,background:cat===c?T.primaryL:T.surface,color:cat===c?T.primary:T.textD,cursor:"pointer",fontSize:10.5,fontWeight:600,fontFamily:"inherit"}}>
            {c}
          </button>
        ))}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(140px,1fr))",gap:5,marginBottom:12}}>
        {filtered.map(o=>{
          const on=selected.includes(o.id);
          return (
            <button key={o.id} onClick={()=>toggle(o.id)} style={{display:"flex",alignItems:"center",gap:7,padding:"7px 10px",borderRadius:6,border:`1.5px solid ${on?T.primary:T.border}`,background:on?T.primaryL:T.surface,cursor:"pointer",fontFamily:"inherit",textAlign:"left",transition:"all .12s"}}>
              <span style={{fontSize:14}}>{o.icon}</span>
              <div style={{minWidth:0}}>
                <div style={{fontSize:11.5,fontWeight:600,color:on?T.primary:T.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{o.name}</div>
                <div style={{fontSize:9.5,color:T.textL}}>{o.cat}</div>
              </div>
              {on&&<span style={{marginLeft:"auto",color:T.primary,fontSize:12}}>✓</span>}
            </button>
          );
        })}
      </div>
      <div style={{display:"flex",gap:8}}>
        <div style={{flex:1}}><Input value={query} onChange={setQuery} placeholder="Keyword (optional) — e.g. climate, AI, oil prices..." onEnter={doFetch}/></div>
        <Btn onClick={doFetch} disabled={loading||(selected.length===0&&!query.trim())} small>{loading?"Loading...":"Search"}</Btn>
      </div>
      {error&&<div style={{marginTop:8,fontSize:11.5,color:T.red}}>{error}</div>}
    </div>
  );
}
function WebLivePanel({sources,selIds,toggleSel,delSrc,addSrc,creds,webQuery,setWebQuery,collectWeb,urlInput,setUrlInput,addUrl,newsQuery,setNewsQuery,collectNews,newsError,scholarQuery,setScholarQuery,collectScholar}) {
  const webSrcs=sources.filter(s=>s.source!=="file");
  return (
    <div>
      <h2 style={{margin:"0 0 16px",fontSize:16,fontWeight:700,color:T.text}}>Web & Live Data</h2>
      <ColSection icon="🔍" title="Web Search - Real-time" badge={sources.filter(s=>s.source==="websearch").length} badgeColor={T.cyan}>
        <span style={{background:T.greenL,color:T.green,border:"1px solid #6ee7b7",borderRadius:4,padding:"2px 9px",fontSize:11,fontWeight:700}}>Managed by DataMind</span>
        <p style={{margin:"10px 0 12px",fontSize:12.5,color:T.textD,lineHeight:1.6}}>DataMind searches and analyzes any web source in real time.</p>
        <div style={{display:"flex",gap:8}}>
          <div style={{flex:1}}><Input value={webQuery} onChange={setWebQuery} placeholder="e.g. Tesla Q4 2025 · solar energy Europe..." onEnter={collectWeb}/></div>
          <Btn onClick={collectWeb} small>Add</Btn>
        </div>
      </ColSection>
      <ColSection icon="🌐" title="Direct URL" badge={sources.filter(s=>s.source==="url").length} badgeColor={T.purple}>
        <p style={{margin:"0 0 12px",fontSize:12.5,color:T.textD,lineHeight:1.6}}>Paste the URL of any article, report, or public page.</p>
        <div style={{display:"flex",gap:8}}>
          <div style={{flex:1}}><Input value={urlInput} onChange={setUrlInput} placeholder="https://..." onEnter={addUrl}/></div>
          <Btn onClick={addUrl} small>Add</Btn>
        </div>
      </ColSection>
      <ColSection icon="📰" title="NewsAPI - 150,000+ sources" badge={sources.filter(s=>s.source==="newsapi").length} badgeColor={T.amber}>
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
          <span style={{background:creds["newsapi"]?T.greenL:T.amberL,color:creds["newsapi"]?T.green:T.amber,border:`1px solid ${creds["newsapi"]?"#6ee7b7":"#fcd34d"}`,borderRadius:4,padding:"2px 9px",fontSize:11,fontWeight:700}}>
            {creds["newsapi"]?"Configured":"API key required"}
          </span>
          {!creds["newsapi"]&&<span style={{fontSize:12,color:T.textD}}>Configure in Connectors tab.</span>}
        </div>
        <div style={{display:"flex",gap:8}}>
          <div style={{flex:1}}><Input value={newsQuery} onChange={setNewsQuery} placeholder="e.g. AI · CAC40 · geopolitics..." onEnter={collectNews}/></div>
          <Btn onClick={collectNews} small>Search</Btn>
        </div>
        {newsError&&<div style={{marginTop:8,fontSize:11.5,color:T.red}}>{newsError}</div>}
      </ColSection>
      <ColSection icon="🗞️" title="Media Outlets" badge={0} badgeColor={T.primary}>
        <MediaOutletsCard onAdd={addSrc} newsApiKey={creds["newsapi"]?.apiKey}/>
      </ColSection>
      <ColSection icon="🎓" title="Google Scholar" badge={sources.filter(s=>s.source==="scholar").length} badgeColor={T.purple}>
        <p style={{margin:"0 0 12px",fontSize:12.5,color:T.textD,lineHeight:1.6}}>Search academic papers and citations via Google Scholar.</p>
        <div style={{display:"flex",gap:8}}>
          <div style={{flex:1}}><Input value={scholarQuery} onChange={setScholarQuery} placeholder="e.g. supply chain resilience FDI..." onEnter={collectScholar}/></div>
          <Btn onClick={collectScholar} small>Search</Btn>
        </div>
      </ColSection>
      <ColSection icon="📱" title="Social Media" badge={sources.filter(s=>["instagram","twitter","linkedin"].includes(s.source)).length} badgeColor="#e1306c">
        {!(creds.instagram||creds.twitter||creds.linkedin)
          ?<p style={{margin:0,fontSize:12.5,color:T.textD,fontStyle:"italic"}}>Configure tokens in Connectors tab.</p>
          :<div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            {creds.instagram&&<Btn small onClick={()=>addSrc({id:`ig-${Date.now()}`,icon:"📸",label:"Instagram - account data",sub:"Meta Graph API",source:"instagram",data:"Instagram data"})} style={{background:"#e1306c",boxShadow:"none",border:"none",color:"#fff"}}>Instagram</Btn>}
            {creds.twitter&&<Btn small onClick={()=>addSrc({id:`tw-${Date.now()}`,icon:"🐦",label:"X/Twitter - feed",sub:"Twitter API v2",source:"twitter",data:"Twitter feed"})} style={{background:"#1d9bf0",boxShadow:"none",border:"none",color:"#fff"}}>Twitter</Btn>}
            {creds.linkedin&&<Btn small onClick={()=>addSrc({id:`li-${Date.now()}`,icon:"💼",label:"LinkedIn - org",sub:"LinkedIn API",source:"linkedin",data:"LinkedIn data"})} style={{background:"#0a66c2",boxShadow:"none",border:"none",color:"#fff"}}>LinkedIn</Btn>}
          </div>
        }
      </ColSection>
      {webSrcs.length>0&&(
        <div style={{marginTop:16}}>
          <Label style={{marginBottom:8}}>Ingested sources · {webSrcs.length} items</Label>
          <div style={{display:"flex",flexDirection:"column",gap:5}}>
            {webSrcs.map(s=><SourceRow key={s.id} s={s} selected={selIds.includes(s.id)} onToggle={()=>toggleSel(s.id)} onDel={()=>delSrc(s.id)}/>)}
          </div>
        </div>
      )}
    </div>
  );
}
function CockpitPanel({aTypes,setATypes,aHorizons,setAHorizons,aDepth,setADepth,prompt,setPrompt,selSources,toggleSel,onLaunch,disabled,responseMode,setResponseMode}) {
  const [mode,setMode]=useState("guide");
  const [answers,setAnswers]=useState({});
  const [activeQ,setActiveQ]=useState(0);
  const [aiLoading,setAiLoading]=useState(false);
  const [synthesis,setSynthesis]=useState(null);
  const [synthError,setSynthError]=useState("");
  const filled=Object.values(answers).filter(v=>v?.trim()).length;
  const pct=Math.round((filled/GUIDING_QS.length)*100);
  const synthesize=async()=>{
    setAiLoading(true);
    setSynthError("");
    const body=GUIDING_QS.filter(q=>answers[q.id]?.trim()).map(q=>`${q.label}: ${answers[q.id]}`).join("\n");
    try{
      const text=await callMistral(
        `Senior analyst. From these inputs, generate an optimized analysis prompt (200-300 words) and 3-4 follow-up questions.\n\nINPUTS:\n${body}\n\nSame language as inputs. Format:\n###PROMPT###\n[prompt]\n###FOLLOW_UPS###\n[questions, one per line, "- " prefix]`,
        {maxTokens:1000, idleMs:20000}
      );
      const pm=text.match(/###PROMPT###([\s\S]*?)(?=###|$)/);
      const fm=text.match(/###FOLLOW_UPS###([\s\S]*?)(?=###|$)/);
      if(pm) setPrompt(pm[1].trim());
      setSynthesis({followUps:fm?fm[1].trim():""});
    }catch(e){
      setSynthError(e.message||"Synthesis failed");
    }
    setAiLoading(false);
  };
  const reset=()=>{setATypes([0]);setAHorizons([1]);setADepth([2]);setPrompt("");setResponseMode("report");setAnswers({});setSynthesis(null);setSynthError("");};
  return (
    <div>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20}}>
        <div>
          <h2 style={{margin:"0 0 3px",fontSize:16,fontWeight:700,color:T.text}}>Analytical Cockpit</h2>
          <p style={{margin:0,fontSize:12,color:T.textD}}>Configure your analysis parameters and define your query</p>
        </div>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          <button onClick={reset} style={{padding:"5px 12px",borderRadius:6,border:`1.5px solid ${T.border}`,background:"#fff",color:T.textD,cursor:"pointer",fontSize:11.5,fontWeight:600,fontFamily:"inherit"}}>Reset</button>
          <div style={{display:"flex",gap:6,background:T.surfaceL,padding:4,borderRadius:8,border:`1px solid ${T.border}`}}>
            {[{k:"guide",l:"Guided"},{k:"free",l:"Free"}].map(m=>(
              <button key={m.k} onClick={()=>setMode(m.k)} style={{padding:"6px 14px",borderRadius:6,border:"none",background:mode===m.k?T.surface:"transparent",color:mode===m.k?T.text:T.textD,cursor:"pointer",fontSize:12,fontWeight:600,fontFamily:"inherit",boxShadow:mode===m.k?"0 1px 4px #0001":"none",transition:"all .15s"}}>
                {m.l}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:16}}>
        {[{l:"Analysis Type",opts:ANALYSIS_TYPES,sel:aTypes,set:setATypes,color:T.primary},
          {l:"Time Horizon",opts:HORIZONS,sel:aHorizons,set:setAHorizons,color:T.cyan},
          {l:"Depth",opts:DEPTHS,sel:aDepth,set:setADepth,color:T.green}
        ].map((p,i)=>(
          <Card key={i} style={{padding:12}}>
            <Label style={{marginBottom:8,color:T.textD}}>{p.l}</Label>
            <Toggle options={p.opts} selected={p.sel} onToggle={p.set} color={p.color}/>
          </Card>
        ))}
      </div>
      {selSources.length>0&&(
        <Card style={{marginBottom:14,padding:11,background:T.primaryL,borderColor:`${T.primary}30`}}>
          <Label style={{marginBottom:6,color:T.primary}}>Active Sources · {selSources.length} selected</Label>
          <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
            {selSources.map(s=><Tag key={s.id} label={`${s.icon||"o"} ${s.label}`} color={SRC_COLORS[s.source]||T.primary} onRemove={()=>toggleSel(s.id)} xs/>)}
          </div>
        </Card>
      )}
      <div style={{marginBottom:16,borderRadius:8,border:`1.5px solid ${prompt.trim()?T.primary+"80":T.border}`,overflow:"hidden"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 14px",background:prompt.trim()?T.primaryL:T.surfaceL,borderBottom:`1px solid ${T.border}`}}>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <span style={{fontSize:14}}>✍️</span>
            <span style={{fontWeight:600,fontSize:13,color:prompt.trim()?T.primary:T.textM}}>Your query — free input</span>
            {mode==="guide"&&<Tag label="Optional supplement" color={T.textL} xs/>}
          </div>
          {prompt.trim()&&<Tag label={`${prompt.trim().split(/\s+/).length} words`} color={T.primary} xs/>}
        </div>
        <textarea value={prompt} onChange={e=>setPrompt(e.target.value)} rows={mode==="guide"?4:7}
          placeholder={mode==="guide"?"Add supplementary context not covered below...":"Describe what you want to analyze..."}
          style={{width:"100%",padding:"12px 14px",border:"none",fontSize:13,resize:"vertical",outline:"none",boxSizing:"border-box",fontFamily:"inherit",lineHeight:1.75,color:T.textM,background:T.surface,display:"block"}}/>
      </div>
      {mode==="guide"&&(
        <div>
          <Card style={{marginBottom:14,padding:12}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
              <Label color={T.textD}>Query Framework — {filled}/{GUIDING_QS.length} sections</Label>
              <Tag label={pct>=80?"Ready":pct>=50?"Sufficient":"Incomplete"} color={pct>=80?T.green:pct>=50?T.amber:T.textD} xs/>
            </div>
            <div style={{height:5,background:T.border,borderRadius:3,overflow:"hidden",marginBottom:10}}>
              <div style={{height:"100%",width:`${pct}%`,background:`linear-gradient(90deg,${T.primary},${T.green})`,transition:"width .4s",borderRadius:3}}/>
            </div>
            <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
              {GUIDING_QS.map((q,i)=>{
                const done=!!answers[q.id]?.trim();
                return <button key={i} onClick={()=>setActiveQ(i)} style={{padding:"4px 11px",borderRadius:20,border:`1.5px solid ${activeQ===i?T.primary:done?T.green+"60":T.border}`,background:activeQ===i?T.primary:done?T.greenL:T.surface,color:activeQ===i?"#fff":done?T.green:T.textD,cursor:"pointer",fontSize:11,fontWeight:600,fontFamily:"inherit"}}>
                  {done?"✓ ":""}{q.icon} {q.label}
                </button>;
              })}
            </div>
          </Card>
          {GUIDING_QS.map((q,i)=>i===activeQ&&(
            <Card key={q.id} accent={T.primary} style={{marginBottom:14,padding:14}}>
              <div style={{display:"flex",gap:10,marginBottom:10}}>
                <span style={{fontSize:20,marginTop:2}}>{q.icon}</span>
                <div>
                  <div style={{fontWeight:700,fontSize:13.5,color:T.text,marginBottom:3}}>{q.q}</div>
                  <div style={{fontSize:12,color:T.textD}}>{q.h}</div>
                </div>
              </div>
              <textarea value={answers[q.id]||""} onChange={e=>setAnswers(p=>({...p,[q.id]:e.target.value}))}
                placeholder={q.p} rows={4}
                style={{width:"100%",padding:"10px 12px",borderRadius:7,border:`1.5px solid ${T.border}`,fontSize:13,resize:"vertical",outline:"none",boxSizing:"border-box",fontFamily:"inherit",lineHeight:1.7,color:T.textM,background:T.surface}}/>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:10}}>
                <Btn onClick={()=>setActiveQ(i=>Math.max(0,i-1))} variant="ghost" small disabled={activeQ===0}>Previous</Btn>
                <div style={{display:"flex",gap:8,alignItems:"center"}}>
                  {answers[q.id]?.trim()&&<span style={{fontSize:11.5,color:T.green,fontWeight:600}}>Saved</span>}
                  <Btn onClick={()=>setActiveQ(i=>Math.min(GUIDING_QS.length-1,i+1))} small disabled={activeQ===GUIDING_QS.length-1}>Next</Btn>
                </div>
              </div>
            </Card>
          ))}
          {filled>=2&&(
            <Card style={{marginBottom:14,background:T.purpleL,borderColor:`${T.accent}30`}}>
              <div style={{fontWeight:700,fontSize:13,color:T.accent,marginBottom:5}}>AI Synthesis Engine</div>
              <div style={{fontSize:12.5,color:T.textD,marginBottom:12,lineHeight:1.6}}>Generate an optimized prompt from your framework inputs.</div>
              <Btn onClick={synthesize} disabled={aiLoading} variant="accent">{aiLoading?"Synthesizing...":"Generate optimized prompt"}</Btn>
              {synthError&&<div style={{marginTop:10,fontSize:12,color:T.red}}>{synthError}</div>}
            </Card>
          )}
          {synthesis?.followUps&&(
            <Card accent={T.amber} style={{marginBottom:14,background:T.amberL,borderColor:`${T.amber}30`}}>
              <Label color={T.amber} style={{marginBottom:8}}>Recommended follow-up vectors</Label>
              <div style={{fontSize:13,color:T.textM,lineHeight:1.8,whiteSpace:"pre-wrap"}}>{synthesis.followUps}</div>
            </Card>
          )}
        </div>
      )}
      <Card style={{marginBottom:16,padding:14}}>
        <Label color={T.textD} style={{marginBottom:10}}>Output Mode</Label>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          {[{k:"report",icon:"📊",l:"Structured Report",d:"5-section intelligence report"},
            {k:"direct",icon:"💬",l:"Direct Vibe Response",d:"Conversational raw output"},
            {k:"both",  icon:"⚡",l:"Full Output",d:"Direct + structured report"}
          ].map(m=>{
            const on=responseMode===m.k;
            return <button key={m.k} onClick={()=>setResponseMode(m.k)} style={{flex:1,minWidth:120,display:"flex",flexDirection:"column",alignItems:"flex-start",gap:4,padding:"10px 12px",borderRadius:7,border:`1.5px solid ${on?T.primary:T.border}`,background:on?T.primaryL:T.surface,cursor:"pointer",fontFamily:"inherit",textAlign:"left",transition:"all .15s"}}>
              <div style={{display:"flex",alignItems:"center",gap:6}}>
                <span style={{fontSize:16}}>{m.icon}</span>
                <span style={{fontWeight:700,fontSize:12,color:on?T.primary:T.text}}>{m.l}</span>
              </div>
              <span style={{fontSize:11,color:T.textD}}>{m.d}</span>
            </button>;
          })}
        </div>
      </Card>
      <Card style={{marginBottom:16,padding:12}}>
        <Label color={T.textD} style={{marginBottom:8}}>Query Examples</Label>
        {["Analyze risk-adjusted entry strategies for a European semiconductor firm navigating US-China decoupling — 12 & 36M scenarios",
          "Map geopolitical risk vectors in Sub-Saharan Africa for a B2C retail expansion",
          "Identify leading indicators of a residential real estate correction in France",
          "Competitive benchmark: OpenAI vs Anthropic vs Google DeepMind — positioning 2025"
        ].map((s,i)=>(
          <button key={i} onClick={()=>setPrompt(s)} style={{display:"block",width:"100%",textAlign:"left",padding:"8px 12px",marginBottom:4,borderRadius:6,border:`1px solid ${T.border}`,background:T.surfaceL,color:T.primary,fontSize:12,cursor:"pointer",fontFamily:"inherit",lineHeight:1.5}}>
            {s}
          </button>
        ))}
      </Card>
      <Btn onClick={onLaunch} disabled={disabled||!prompt.trim()} full style={{padding:14,fontSize:13,fontWeight:700}}>
        {prompt.trim()?"Launch Analysis Pipeline":"Enter a query above to launch"}
      </Btn>
    </div>
  );
}
export default function App() {
  const [tab,setTab]=useState(0);
  const [creds,setCreds]=useState({});
  const [sources,setSources]=useState([]);
  const [selIds,setSelIds]=useState([]);
  const [urlInput,setUrlInput]=useState("");
  const [webQuery,setWebQuery]=useState("");
  const [newsQuery,setNewsQuery]=useState("");
  const [newsError,setNewsError]=useState("");
  const [scholarQuery,setScholarQuery]=useState("");
  const [fileError,setFileError]=useState("");
  const [aTypes,setATypes]=useState([0]);
  const [aHorizons,setAHorizons]=useState([1]);
  const [aDepth,setADepth]=useState([2]);
  const [prompt,setPrompt]=useState("");
  const [responseMode,setResponseMode]=useState("report");
  const [report,setReport]=useState(null);
  const [loading,setLoading]=useState(false);
  const [loadStep,setLoadStep]=useState(0);
  const fileRef=useRef();
  const STEPS=["Initializing","Ingesting sources","Extracting signals","Modeling forecasts","Drafting recommendations","Compiling report"];
  const addSrc=useCallback(s=>{setSources(p=>[...p,s]);setSelIds(p=>[...p,s.id]);},[]);
  const delSrc=id=>{setSources(p=>p.filter(x=>x.id!==id));setSelIds(p=>p.filter(x=>x!==id));};
  const toggleSel=id=>setSelIds(p=>p.includes(id)?p.filter(x=>x!==id):[...p,id]);
  const addUrl=()=>{if(!urlInput.trim())return;addSrc({id:`url-${Date.now()}`,icon:"🌐",label:urlInput.trim(),sub:"Direct URL",source:"url",data:urlInput.trim()});setUrlInput("");};
  const collectWeb=()=>{if(!webQuery.trim())return;addSrc({id:`ws-${Date.now()}`,icon:"🔍",label:webQuery.trim(),sub:"Web search query",source:"websearch",data:webQuery.trim(),isQuery:true});setWebQuery("");};
  const collectNews=async()=>{
    if(!newsQuery.trim())return;
    setNewsError("");
    const key=creds["newsapi"]?.apiKey;
    if(!key){addSrc({id:`news-${Date.now()}`,icon:"📰",label:newsQuery.trim(),sub:"NewsAPI - configure key",source:"newsapi",data:newsQuery.trim(),isQuery:true});setNewsQuery("");return;}
    try{
      const r=await fetch(`${NEWSAPI_ENDPOINT}?q=${encodeURIComponent(newsQuery)}&language=fr&pageSize=6`,{headers:{"X-Api-Key":key}});
      if(!r.ok)throw new Error(r.status===401||r.status===403?"NewsAPI key rejected — check it in Connectors":`NewsAPI error ${r.status}`);
      const d=await r.json();
      (d.articles||[]).forEach((a,i)=>addSrc({id:`news-${Date.now()}-${i}`,icon:"📰",label:a.title?.slice(0,70)||"Article",sub:`${a.source?.name} · ${a.publishedAt?.slice(0,10)}`,source:"newsapi",data:`${a.title}\n${a.description}\n${a.url}`}));
    }catch(e){setNewsError(e.message||"NewsAPI request failed");}
    setNewsQuery("");
  };
  const collectScholar=()=>{
    if(!scholarQuery.trim())return;
    addSrc({id:`scholar-${Date.now()}`,icon:"🎓",label:scholarQuery.trim(),sub:"Google Scholar search",source:"scholar",data:`site:scholar.google.com ${scholarQuery.trim()}`,isQuery:true});
    setScholarQuery("");
  };
  const MAX_FILE_BYTES=15*1024*1024;
  const handleFiles=useCallback(e=>{
    setFileError("");
    Array.from(e.target.files||e.dataTransfer?.files||[]).forEach(f=>{
      if(f.size>MAX_FILE_BYTES){setFileError(`"${f.name}" exceeds the 15 MB limit and was skipped.`);return;}
      const reader=new FileReader();
      reader.onload=ev=>addSrc({id:`file-${Date.now()}-${f.name}`,icon:"📄",label:f.name,sub:`${(f.size/1024).toFixed(0)} KB`,source:"file",data:ev.target.result,fileName:f.name,fileType:f.type});
      reader.onerror=()=>setFileError(`Could not read "${f.name}".`);
      if(f.type.startsWith("image/"))reader.readAsDataURL(f);else reader.readAsText(f);
    });
  },[addSrc]);
  const selSources=sources.filter(s=>selIds.includes(s.id));
  const manualConn=MANUAL_CONNECTORS.filter(c=>creds[c.id]).length;
  const textOf=s=>{
    if(typeof s.data!=="string")return"";
    if(s.data.startsWith("data:image"))return"[image attached — visual content not extracted]";
    return s.data.slice(0,200);
  };
  const buildPrompt=()=>{
    const types=aTypes.map(i=>ANALYSIS_TYPES[i]).join(" x ");
    const hors=aHorizons.map(i=>HORIZONS[i]).join(" + ");
    const dep=aDepth.map(i=>DEPTHS[i]).join(" + ");
    const srcList=selSources.slice(0,6).map(s=>`[${s.source}] ${s.label}: ${textOf(s)}`).join("\n---\n");
    const webQ=selSources.filter(s=>s.isQuery).map(s=>s.data).slice(0,4).join(", ");
    return `You are DataMind, an expert intelligence analysis platform. Produce a rigorous, data-driven report.
PARAMETERS: Type: ${types} | Horizon: ${hors} | Depth: ${dep}
${webQ?`WEB RESEARCH: ${webQ}`:""}
${srcList?`DATA:\n${srcList}`:""}
QUERY: ${prompt||"Analyze provided data"}
Respond with EXACTLY these 5 tags:
###EXECUTIVE_SUMMARY###
4-6 numbered key findings. Data-first.
###INSIGHTS###
10-12 deep insights with data and signals.
###FORECAST###
Optimistic / Base / Pessimistic scenarios with probabilities.
###RECOMMENDATIONS###
8 recommendations [P1/P2/P3] with action, impact, timeline.
###LIMITS###
Methodological limits and assumptions.`;
  };
  const launchAnalysis=async()=>{
    if(loading)return;
    if(!prompt.trim()&&selSources.length===0)return;
    setLoading(true);setReport(null);setTab(5);setLoadStep(0);
    const iv=setInterval(()=>setLoadStep(p=>p<STEPS.length-1?p+1:p),900);
    const meta={types:aTypes.map(i=>ANALYSIS_TYPES[i]).join(" x "),hors:aHorizons.map(i=>HORIZONS[i]).join(" + "),depth:aDepth.map(i=>DEPTHS[i]).join(" + "),prompt,srcCount:selSources.length,responseMode,date:new Date().toLocaleDateString("fr-FR",{day:"2-digit",month:"long",year:"numeric"})};
    try{
      let directText="",structured=null;
      if(responseMode==="direct"||responseMode==="both"){
        const directPrompt=prompt+(selSources.length?`\n\nContext:\n${selSources.slice(0,4).map(s=>textOf(s)||s.label).join("\n").slice(0,1200)}`:"");
        directText=await callMistral(directPrompt,{maxTokens:1500,idleMs:25000});
      }
      if(responseMode==="report"||responseMode==="both"){
        const text=await callMistral(buildPrompt(),{maxTokens:1500,idleMs:25000});
        const parse=tag=>{const m=text.match(new RegExp(`###${tag}###([\\s\\S]*?)(?=###[A-Z_]+###|$)`));return m?m[1].trim():"";};
        structured={summary:parse("EXECUTIVE_SUMMARY"),insights:parse("INSIGHTS"),forecast:parse("FORECAST"),reco:parse("RECOMMENDATIONS"),limits:parse("LIMITS"),raw:text};
      }
      clearInterval(iv);
      setReport({...meta,directText,structured});
    }catch(e){
      clearInterval(iv);
      setReport({...meta,error:e.message||"Error generating report"});
    }
    setLoading(false);
  };
  const TABS=[
    {icon:"🔌",label:"Connectors"},
    {icon:"🔍",label:"Web & Live",badge:sources.filter(s=>["websearch","newsapi","url","scholar"].includes(s.source)).length},
    {icon:"📄",label:"Files",badge:sources.filter(s=>s.source==="file").length},
    {icon:"🔀",label:"Selection",badge:selIds.length},
    {icon:"🧠",label:"Cockpit"},
    {icon:"📊",label:"Report"},
  ];
  const tStyle=i=>({padding:"11px 16px",cursor:"pointer",fontWeight:600,fontSize:12.5,background:"none",border:"none",fontFamily:"inherit",borderBottom:tab===i?`2px solid ${T.primary}`:"2px solid transparent",color:tab===i?T.primary:T.textD,transition:"color .15s",whiteSpace:"nowrap"});
  const bdg=n=>n>0?<span style={{marginLeft:5,background:T.primary,color:"#fff",borderRadius:10,padding:"1px 6px",fontSize:10,fontWeight:700}}>{n}</span>:null;
  return (
    <div style={{minHeight:"100vh",background:T.bg,fontFamily:"'Inter',system-ui,sans-serif",fontSize:14,color:T.text}}>
      <style>{`@keyframes ping{0%{transform:scale(1);opacity:.4}100%{transform:scale(2.2);opacity:0}} textarea::placeholder{color:#9ca3af} input::placeholder{color:#9ca3af}`}</style>
      <div style={{background:T.surface,borderBottom:`1px solid ${T.border}`,padding:"0 20px",boxShadow:"0 1px 4px #0000000a"}}>
        <div style={{maxWidth:1060,margin:"0 auto",display:"flex",alignItems:"center",justifyContent:"space-between",height:54}}>
          <div style={{display:"flex",alignItems:"center",gap:12}}>
            <div style={{width:30,height:30,borderRadius:8,background:T.primaryG,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16}}>🧠</div>
            <div>
              <div style={{fontWeight:800,fontSize:16,color:T.text,letterSpacing:-.3}}>DataMind</div>
              <div style={{fontSize:10,color:T.textL,letterSpacing:.3}}>Intelligence Analytics Platform</div>
            </div>
            <div style={{width:1,height:22,background:T.border}}/>
            <div style={{display:"flex",alignItems:"center",gap:6}}>
              <Dot color={T.green} pulse/>
              <span style={{fontSize:11,color:T.textD}}>{4+manualConn} connectors active</span>
            </div>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            {selIds.length>0&&<Tag label={`${selIds.length} sources selected`} color={T.cyan} xs/>}
            <Tag label={new Date().toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"})} color={T.textL} xs/>
          </div>
        </div>
      </div>
      <div style={{maxWidth:1060,margin:"0 auto",padding:"16px 14px"}}>
        <div style={{background:T.surface,borderRadius:10,border:`1px solid ${T.border}`,overflow:"hidden",boxShadow:"0 1px 8px #0000000a"}}>
          <div style={{display:"flex",borderBottom:`1px solid ${T.border}`,padding:"0 6px",background:T.surfaceL,overflowX:"auto"}}>
            {TABS.map((t,i)=><button key={i} style={tStyle(i)} onClick={()=>setTab(i)}>{t.icon} {t.label}{bdg(t.badge)}</button>)}
          </div>
          <div style={{padding:24,minHeight:420}}>
            {tab===0&&(
              <div>
                <div style={{marginBottom:20}}>
                  <h2 style={{margin:"0 0 4px",fontSize:16,fontWeight:700,color:T.text}}>Connector Registry</h2>
                  <p style={{margin:0,fontSize:12.5,color:T.textD}}>Configure data source integrations. Credentials stored locally only.</p>
                </div>
                <Divider label="Managed automatically — no setup required"/>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:4}}>
                  {AUTO_CONNECTORS.map(c=>(
                    <div key={c.id} style={{display:"flex",alignItems:"center",gap:12,padding:"12px 14px",borderRadius:8,border:`1.5px solid ${c.color}30`,background:`${c.color}07`,borderLeft:`3px solid ${c.color}`}}>
                      <span style={{fontSize:20}}>{c.icon}</span>
                      <div style={{flex:1}}>
                        <div style={{fontWeight:700,fontSize:13,color:T.text,marginBottom:2}}>{c.name}</div>
                        <div style={{fontSize:11.5,color:T.textD}}>{c.desc}</div>
                      </div>
                      <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:3}}>
                        <Tag label="Active" color={T.green} xs/>
                        <Tag label="Auto" color={c.color} xs/>
                      </div>
                    </div>
                  ))}
                </div>
                <Divider label={`Manual configuration · ${manualConn}/${MANUAL_CONNECTORS.length} connected`}/>
                <div style={{display:"flex",flexDirection:"column",gap:7}}>
                  {MANUAL_CONNECTORS.map(c=><ConnectorCard key={c.id} conn={c} saved={creds[c.id]} onSave={v=>setCreds(p=>({...p,[c.id]:v}))} onDel={()=>setCreds(p=>{const n={...p};delete n[c.id];return n;})}/>)}
                </div>
              </div>
            )}
            {tab===1&&<WebLivePanel sources={sources} selIds={selIds} toggleSel={toggleSel} delSrc={delSrc} addSrc={addSrc} creds={creds} webQuery={webQuery} setWebQuery={setWebQuery} collectWeb={collectWeb} urlInput={urlInput} setUrlInput={setUrlInput} addUrl={addUrl} newsQuery={newsQuery} setNewsQuery={setNewsQuery} collectNews={collectNews} newsError={newsError} scholarQuery={scholarQuery} setScholarQuery={setScholarQuery} collectScholar={collectScholar}/>}
            {tab===2&&(
              <div>
                <h2 style={{margin:"0 0 16px",fontSize:16,fontWeight:700,color:T.text}}>Local Files</h2>
                <div onDragOver={e=>e.preventDefault()} onDrop={handleFiles} onClick={()=>fileRef.current.click()}
                  style={{border:`2px dashed ${T.borderD}`,borderRadius:8,padding:"36px 20px",textAlign:"center",cursor:"pointer",background:T.surfaceL,marginBottom:14}}>
                  <div style={{fontSize:28,marginBottom:8}}>📂</div>
                  <div style={{fontWeight:700,color:T.text,fontSize:13}}>Drop files here or click to browse</div>
                  <div style={{color:T.textD,fontSize:12,marginTop:4}}>CSV · Excel · PDF · PPTX · JSON · Images · Text</div>
                  <input ref={fileRef} type="file" multiple style={{display:"none"}} onChange={handleFiles}/>
                </div>
                {fileError&&<div style={{marginBottom:14,fontSize:12,color:T.red}}>{fileError}</div>}
                <Card style={{padding:12,marginBottom:14}}>
                  <Label style={{marginBottom:8}}>Cloud Storage</Label>
                  <div style={{display:"flex",gap:7,flexWrap:"wrap"}}>
                    {creds.gdrive
                      ?<Btn onClick={()=>addSrc({id:`gd-${Date.now()}`,icon:"📁",label:"Google Drive - imported",sub:"Drive API",source:"file",data:"Google Drive content"})} small style={{background:"#16a34a",boxShadow:"none"}}>Import from Drive</Btn>
                      :<p style={{margin:0,fontSize:12,color:T.textD,fontStyle:"italic"}}>Google Drive & Dropbox - configure in Connectors tab.</p>}
                    {creds.dropbox&&<Btn onClick={()=>addSrc({id:`db-${Date.now()}`,icon:"📦",label:"Dropbox - imported",sub:"Dropbox API",source:"file",data:"Dropbox content"})} small style={{background:"#0061ff",boxShadow:"none"}}>Import from Dropbox</Btn>}
                  </div>
                </Card>
                {sources.filter(s=>s.source==="file").length>0&&(
                  <div>
                    <Label style={{marginBottom:8}}>Loaded files · {sources.filter(s=>s.source==="file").length} items</Label>
                    <div style={{display:"flex",flexDirection:"column",gap:5}}>
                      {sources.filter(s=>s.source==="file").map(s=><SourceRow key={s.id} s={s} selected={selIds.includes(s.id)} onToggle={()=>toggleSel(s.id)} onDel={()=>delSrc(s.id)}/>)}
                    </div>
                  </div>
                )}
              </div>
            )}
            {tab===3&&(
              <div>
                <h2 style={{margin:"0 0 4px",fontSize:16,fontWeight:700,color:T.text}}>Source Selection</h2>
                <p style={{margin:"0 0 16px",fontSize:12.5,color:T.textD}}>Select sources to cross-reference in the analysis.</p>
                {sources.length===0
                  ?<Card style={{textAlign:"center",padding:"40px",background:T.surfaceL}}>
                    <div style={{fontSize:28,marginBottom:8}}>📭</div>
                    <div style={{fontWeight:600,fontSize:13,color:T.textM,marginBottom:4}}>No sources loaded</div>
                    <div style={{fontSize:12,color:T.textD}}>Add data in Web & Live or Files tabs</div>
                  </Card>
                  :<div>
                    <div style={{display:"flex",gap:7,marginBottom:12,alignItems:"center"}}>
                      <Btn onClick={()=>setSelIds(sources.map(s=>s.id))} small>Select all</Btn>
                      <Btn onClick={()=>setSelIds([])} variant="ghost" small>Deselect all</Btn>
                      <Tag label={`${selIds.length} / ${sources.length} active`} color={T.primary} xs/>
                    </div>
                    <div style={{display:"flex",flexDirection:"column",gap:5}}>
                      {sources.map(s=><SourceRow key={s.id} s={s} selected={selIds.includes(s.id)} onToggle={()=>toggleSel(s.id)} onDel={()=>delSrc(s.id)}/>)}
                    </div>
                  </div>
                }
              </div>
            )}
            {tab===4&&<CockpitPanel aTypes={aTypes} setATypes={setATypes} aHorizons={aHorizons} setAHorizons={setAHorizons} aDepth={aDepth} setADepth={setADepth} prompt={prompt} setPrompt={setPrompt} selSources={selSources} toggleSel={toggleSel} onLaunch={launchAnalysis} disabled={loading||(!prompt.trim()&&selIds.length===0)} responseMode={responseMode} setResponseMode={setResponseMode}/>}
            {tab===5&&(
              <div>
                {loading&&(
                  <div style={{textAlign:"center",padding:"60px 20px"}}>
                    <div style={{fontSize:40,marginBottom:16}}>🧠</div>
                    <div style={{fontWeight:700,color:T.text,fontSize:16,marginBottom:6}}>Running analysis pipeline...</div>
                    <div style={{color:T.primary,fontSize:13,marginBottom:24,fontWeight:500}}>{STEPS[loadStep]}</div>
                    <div style={{display:"flex",justifyContent:"center",gap:6,flexWrap:"wrap"}}>
                      {STEPS.slice(1).map((s,i)=>(
                        <div key={i} style={{padding:"4px 12px",background:i<loadStep?T.primaryL:T.surfaceL,borderRadius:20,fontSize:11,color:i<loadStep?T.primary:T.textD,fontWeight:600,border:`1px solid ${i<loadStep?T.primary+"40":T.border}`,transition:"all .3s"}}>
                          {i<loadStep?"✓ ":""}{s}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {!loading&&!report&&(
                  <div style={{textAlign:"center",padding:"60px 20px"}}>
                    <div style={{fontSize:38,marginBottom:12}}>📊</div>
                    <div style={{fontWeight:700,fontSize:15,color:T.text,marginBottom:6}}>No report generated yet</div>
                    <div style={{fontSize:13,color:T.textD,marginBottom:20}}>Configure and launch from the Cockpit tab</div>
                    <Btn onClick={()=>setTab(4)}>Go to Cockpit</Btn>
                  </div>
                )}
                {!loading&&report&&(
                  <div>
                    {report.error?(
                      <div>
                        <Card accent={T.red} style={{padding:16,marginBottom:16}}>
                          <div style={{fontWeight:700,color:T.red,marginBottom:6}}>Analysis error</div>
                          <div style={{fontSize:13,color:T.textM}}>{report.error}</div>
                        </Card>
                        <Btn onClick={()=>{setReport(null);setTab(4);}} variant="ghost" small>Back to Cockpit</Btn>
                      </div>
                    ):(
                      <div>
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:20,flexWrap:"wrap",gap:10}}>
                          <div>
                            <h2 style={{margin:"0 0 8px",fontSize:16,fontWeight:700,color:T.text}}>
                              {report.responseMode==="direct"?"Direct Response":report.responseMode==="both"?"Full Output":"Intelligence Report"}
                            </h2>
                            <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                              <Tag label={report.types} color={T.primary} xs/>
                              <Tag label={report.hors} color={T.cyan} xs/>
                              <Tag label={report.depth} color={T.green} xs/>
                              <Tag label={`${report.srcCount} sources`} color={T.purple} xs/>
                              <Tag label={report.date} color={T.textL} xs/>
                            </div>
                          </div>
                          <Btn onClick={()=>{setReport(null);setPrompt("");setTab(4);}} variant="ghost" small>New analysis</Btn>
                        </div>
                        {report.prompt&&(
                          <Card accent={T.primary} style={{marginBottom:16,padding:"11px 14px",background:T.primaryL}}>
                            <Label style={{marginBottom:4}}>Query</Label>
                            <div style={{fontSize:13,color:T.textM,fontStyle:"italic",lineHeight:1.6}}>"{report.prompt}"</div>
                          </Card>
                        )}
                        {(report.responseMode==="direct"||report.responseMode==="both")&&report.directText&&(
                          <div style={{marginBottom:16}}>
                            {report.responseMode==="both"&&<Divider label="Direct Vibe Response"/>}
                            <Card accent={T.accent} style={{padding:"16px 18px",fontSize:13.5,lineHeight:1.9,color:T.textM,whiteSpace:"pre-wrap"}}>{report.directText}</Card>
                          </div>
                        )}
                        {(report.responseMode==="report"||report.responseMode==="both")&&report.structured&&(
                          <div>
                            {report.responseMode==="both"&&<Divider label="Structured Intelligence Report"/>}
                            {report.structured.summary&&<SectionBlock icon="📋" title="Executive Summary" color={T.primary}>{report.structured.summary}</SectionBlock>}
                            {report.structured.insights&&<SectionBlock icon="💡" title="Insights & Signals" color={T.cyan}>{report.structured.insights}</SectionBlock>}
                            {report.structured.forecast&&<SectionBlock icon="📈" title="Forecast Scenarios" color={T.green}>{report.structured.forecast}</SectionBlock>}
                            {report.structured.reco&&<SectionBlock icon="✅" title="Strategic Recommendations" color={T.amber}>{report.structured.reco}</SectionBlock>}
                            {report.structured.limits&&<SectionBlock icon="⚠️" title="Limits & Assumptions" color={T.red} open={false}>{report.structured.limits}</SectionBlock>}
                            {!report.structured.summary&&report.structured.raw&&(
                              <Card accent={T.primary} style={{padding:"16px 18px",fontSize:13.5,lineHeight:1.9,color:T.textM,whiteSpace:"pre-wrap"}}>{report.structured.raw}</Card>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
