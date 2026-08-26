import { useState, useRef, useCallback } from "react";

// ✅ DEBUG : Vérifie le chargement des variables
console.log('🔴 [DEBUG] import.meta.env:', import.meta.env);
console.log('🔴 [DEBUG] VITE_MISTRAL_API_URL:', import.meta.env.VITE_MISTRAL_API_URL);
console.log('🔴 [DEBUG] VITE_MISTRAL_API_KEY:', import.meta.env.VITE_MISTRAL_API_KEY ? '✅ (masquée)' : '❌ MANQUANTE');

// ✅ FALLBACK : Si Vite ne charge pas le .env, utilise les valeurs directes
const MISTRAL_API_URL = import.meta.env.VITE_MISTRAL_API_URL || "https://api.mistral.ai/v1";
const MISTRAL_API_KEY = import.meta.env.VITE_MISTRAL_API_KEY || "yIdnqotpuw7aYdlQayHtIKBbXrkFORR5";

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
      // ✅ Utilise les constantes avec fallback
      res = await fetch(`${MISTRAL_API_URL}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${MISTRAL_API_KEY}`
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
        throw new Error("❌ Erreur d'authentification Mistral : vérifie ta clé API dans .env ou .env.local");
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
  {id:"reuters",     name:"Reuters",               icon:"🌐", domain:"reuters.com",                  cat:"INT"},
  {id:"bloomberg",   name:"Bloomberg",             icon:"🌐", domain:"bloomberg.com",                cat:"INT"},
  {id:"apnews",      name:"AP News",               icon:"🌐", domain:"apnews.com",                   cat:"INT"},
  {id:"ft",          name:"Financial Times",       icon:"🌐", domain:"ft.com",                       cat:"INT"},
  {id:"economist",   name:"The Economist",         icon:"🌐", domain:"economist.com",                cat:"INT"},
  {id:"foreignaff",  name:"Foreign Affairs",       icon:"🌐", domain:"foreignaffairs.com",           cat:"INT"},
  {id:"lemonde",     name:"Le Monde",              icon:"🇫🇷", domain:"lemonde.fr",                  cat:"FR"},
  {id:"lefigaro",    name:"Le Figaro",             icon:"🇫🇷", domain:"lefigaro.fr",                 cat:"FR"},
  {id:"lesechos",   
