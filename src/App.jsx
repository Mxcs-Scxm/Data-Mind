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
      // ✅ CORRIGÉ : process.env pour CRA (pas import.meta.env)
      res = await fetch(`${process.env.REACT_APP_MISTRAL_API_URL}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${process.env.REACT_APP_MISTRAL_API_KEY}`
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
        throw new Error("Mistral API authentication failed — check your .env file");
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
