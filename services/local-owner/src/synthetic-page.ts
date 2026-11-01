import { SYNTHETIC_COPY } from "./synthetic-copy.js";
import { SYNTHETIC_CLIENT_JS } from "./synthetic-client.js";

export function syntheticPage(capability: string) {
  if (!/^[a-f0-9]{64}$/.test(capability)) throw Error("SYNTHETIC_CAPABILITY_INVALID");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="lab-capability" content="${capability}"><title>AWS synthetic analysis lab</title><link rel="stylesheet" href="/owner.css"><script src="/owner.js" defer></script></head><body><main>
<p class="badge">PRIVATE · SYNTHETIC DATA · REAL AWS BEDROCK</p><h1 id="title">AWS synthetic analysis lab</h1>
<label for="language" id="language-label">Language</label> <select id="language"><option value="en">English</option><option value="ja">日本語</option><option value="ko">한국어</option></select>
<p id="explanation"></p><p id="boundary"></p><p id="cost"></p>
<section><h2 id="input-title">Fixed learning input</h2><p>QLD · USD 100 · +2 · 2026-01-01T00:00:00Z</p><strong id="synthetic-warning"></strong></section>
<div class="actions"><button id="run" disabled>Run once</button><button id="refresh">Refresh result (no model call)</button><button id="close">End session</button></div>
<p id="status" role="status" aria-live="polite"></p><section id="result" hidden><h2 id="result-title"></h2><div id="analysis"></div><p id="usage"></p></section>
<p id="notice"></p><a href="https://chatgpt.com/" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer">ChatGPT</a>
</main></body></html>`;
}
export const SYNTHETIC_CSS = `*{box-sizing:border-box}body{margin:0;background:#0e1729;color:#e8edf7;font:17px/1.65 system-ui,sans-serif}main{max-width:880px;margin:40px auto;padding:24px}h1{font-size:32px;line-height:1.25}h2{font-size:21px}.badge{color:#8de3d7;font-size:13px;letter-spacing:.07em}section{background:#17253c;border:1px solid #344762;border-radius:12px;padding:20px;margin:24px 0}.actions{display:flex;flex-wrap:wrap;gap:12px}button,select{font:inherit;padding:10px 16px;border-radius:8px;border:1px solid #7188aa;background:#213653;color:inherit}button{cursor:pointer}button:disabled{opacity:.5;cursor:default}button:focus-visible,a:focus-visible,select:focus-visible{outline:3px solid #79e3dc;outline-offset:3px}#run{background:#12665c}a{color:#8bd5ff}#status,#usage{overflow-wrap:anywhere}strong{color:#ffcf86}@media(max-width:600px){main{margin:0;padding:20px}h1{font-size:27px}.actions>*{width:100%}}`;
export const SYNTHETIC_JS = `"use strict";\nconst texts=${JSON.stringify(SYNTHETIC_COPY).replaceAll("<", "\\u003c")};\n${SYNTHETIC_CLIENT_JS}`;
