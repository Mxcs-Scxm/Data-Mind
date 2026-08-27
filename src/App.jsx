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

// ✅ FONCTION callMistral (avec proxy)
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
      res = await fetch(`/api/mistral/v1/chat/completions`, {
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
          } catch {}
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
    if (err.name !== "AbortError") throw err;
    return await attempt(Math.max(400, Math.floor(maxTokens * 0.5)));
  }
}

// ✅ CONSTANTES
const AUTO_CONNECTORS = [
  {id:"mistral", icon:"🧠", name:"Mistral AI", desc:"Core inference · reasoning · synthesis", color:T.accent},
  {id:"websearch", icon:"🔍", name:"Web Search", desc:"Live web retrieval · news", color:T.cyan},
  {id:"filedoc", icon:"📄", name:"Document Parser", desc:"PDF · Excel · CSV", color:T.teal},
  {id:"translate", icon:"🌐", name:"Multilingual", desc:"FR · EN · AR · ES", color:T.green},
];

// ✅ COMPOSANTS UI
const Label = ({children, color=T.textD, style={}}) => (
  <div style={{fontSize:10.5,fontWeight:700,letterSpacing:1,textTransform:"uppercase",color,...style}}>{children}</div>
);

const Btn = ({onClick,disabled,children,variant="primary",small,full,style={}}) => {
  const base={border:"none",borderRadius:6,fontWeight:600,cursor:disabled?"not-allowed":"pointer",fontFamily:"inherit",transition:"all .15s",fontSize:small?12:13,...style};
  const pad=small?"6px 14px":"10px 20px";
  if(variant==="primary") return <button onClick={onClick} disabled={disabled} style={{...base,padding:pad,width:full?"100%":"auto",background:disabled?"#e5e7eb":T.primaryG,color:disabled?T.textL:"#fff",boxShadow:disabled?"none":"0 1px 8px #2563eb25"}}>{children}</button>;
  return <button onClick={onClick} disabled={disabled} style={{...base,padding:pad,background:T.surfaceL,color:T.textM,border:`1px solid ${T.border}`}}>{children}</button>;
};

const Input = ({value,onChange,placeholder,type="text",onEnter}) => (
  <input value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} type={type}
    onKeyDown={e=>e.key==="Enter"&&onEnter&&onEnter()}
    style={{width:"100%",padding:"9px 12px",borderRadius:6,border:`1.5px solid ${T.border}`,background:T.surface,fontSize:13,outline:"none",fontFamily:"inherit",boxSizing:"border-box",color:T.text}}/>
);

// ✅ COMPOSANT PRINCIPAL
export default function App() {
  const [prompt, setPrompt] = useState("");
  const [response, setResponse] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async () => {
    if (!prompt.trim()) return;
    setLoading(true);
    setError(null);
    setResponse("");
    try {
      await callMistral(prompt, {
        maxTokens: 2000,
        onDelta: (text) => setResponse(text),
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{minHeight:"100vh",background:T.bg,color:T.text,fontFamily:"Inter,system-ui,sans-serif",padding:24}}>
      <div style={{maxWidth:800,margin:"0 auto"}}>
        <h1 style={{fontSize:28,fontWeight:800,marginBottom:24}}>DataMind — Intelligence Analytics Platform</h1>

        <div style={{background:T.surface,borderRadius:8,border:`1px solid ${T.border}`,padding:20,marginBottom:20}}>
          <Input
            value={prompt}
            onChange={setPrompt}
            placeholder="Posez votre question ici..."
            onEnter={handleSubmit}
            disabled={loading}
          />
          <div style={{marginTop:12}}>
            <Btn onClick={handleSubmit} disabled={loading || !prompt.trim()}>
              {loading ? "Chargement..." : "Envoyer"}
            </Btn>
          </div>
        </div>

        {error && (
          <div style={{background:T.redL,border:`1px solid ${T.red}`,borderRadius:8,padding:16,color:T.red,marginBottom:12}}>
            ❌ {error}
          </div>
        )}

        {response && (
          <div style={{background:T.surface,borderRadius:8,border:`1px solid ${T.border}`,padding:20,whiteSpace:"pre-wrap"}}>
            {response}
          </div>
        )}

        <div style={{marginTop:32}}>
          <h2 style={{fontSize:18,fontWeight:700,marginBottom:16}}>Connecteurs disponibles</h2>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(250px, 1fr))",gap:16}}>
            {AUTO_CONNECTORS.map(conn => (
              <div key={conn.id} style={{
                background:T.surface,
                borderRadius:8,
                border:`1px solid ${T.border}`,
                padding:16,
                borderLeft:`3px solid ${conn.color}`
              }}>
                <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
                  <span style={{fontSize:20}}>{conn.icon}</span>
                  <span style={{fontWeight:600,fontSize:14}}>{conn.name}</span>
                </div>
                <div style={{fontSize:12,color:T.textD}}>{conn.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
