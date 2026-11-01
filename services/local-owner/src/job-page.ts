import type { JobRequest } from "../../../frontend/src/api/jobs.js";
import { validateJobRequest } from "../../../frontend/src/api/jobs.js";
import type { OwnerJobSessionStatus } from "./job-session.js";
import { OWNER_PAGE_CSS } from "./page.js";

const en = { title: "Owner job boundary preview", language: "Page language", source: "LOCAL TEST FIXTURE — no AWS, provider or AI calls",
  intent: "Pinned test request", state: "Local state", start: "Start one synthetic job", poll: "Read synthetic status", close: "Close local session",
  note: "One request only. Refresh does not create a new job. Status reads are manual and at least four seconds apart. No price or AI result is displayed.",
  warning: "In a real workflow, closing this page would not stop an AWS task. Separate cloud closure would still be required. This preview cannot contact AWS.",
  busy: "Waiting for the local response…", early: "Wait four seconds before another status read.", error: "The local check is unavailable. Do not retry the job; inspect the operator record.",
  closed: "Local session closed or expired.", ready: "Ready — nothing submitted", accepted: "Submitted — synthetic status available", running: "Synthetic job running", succeeded: "Synthetic job complete — result intentionally absent",
  terminal: "Synthetic job ended — outcome not retained after refresh", failed: "Synthetic job failed — no retry", timedOut: "Synthetic job timed out — no retry" };
type Copy = { [K in keyof typeof en]: string };
export const OWNER_JOB_COPY: Record<"en" | "ja" | "ko", Copy> = {
  en,
  ja: { title: "本人用ジョブ境界のプレビュー", language: "画面の言語", source: "ローカル合成テスト — AWS・データ提供元・AI の呼び出しなし",
    intent: "固定テストリクエスト", state: "ローカル状態", start: "合成ジョブを 1 件開始", poll: "合成ステータスを確認", close: "ローカルセッションを閉じる",
    note: "開始は 1 回のみです。再読み込みで新しいジョブを作成しません。状態確認は手動で 4 秒以上間隔を空けます。株価や AI 結果は表示しません。",
    warning: "実際の運用では、この画面を閉じても AWS タスクは停止しません。クラウド側の終了確認が別途必要です。このプレビューは AWS に接続できません。",
    busy: "ローカル応答を待機中…", early: "次の状態確認まで 4 秒待ってください。", error: "ローカル確認を継続できません。ジョブを再試行せず、運用記録を確認してください。",
    closed: "ローカルセッションが終了または失効しました。", ready: "準備完了 — 未送信", accepted: "送信済み — 合成ステータスを確認可能", running: "合成ジョブ実行中", succeeded: "合成ジョブ完了 — 結果は意図的に非表示",
    terminal: "合成ジョブ終了 — 再読み込み後は結果状態を保持しません", failed: "合成ジョブ失敗 — 再試行しません", timedOut: "合成ジョブ時間切れ — 再試行しません" },
  ko: { title: "본인용 작업 경계 미리보기", language: "화면 언어", source: "로컬 합성 테스트 — AWS·공급자·AI 호출 없음",
    intent: "고정된 테스트 요청", state: "로컬 상태", start: "합성 작업 1건 시작", poll: "합성 상태 확인", close: "로컬 세션 닫기",
    note: "시작은 한 번만 가능합니다. 새로고침해도 새 작업을 만들지 않습니다. 상태 확인은 수동이며 최소 4초 간격입니다. 시세나 AI 결과는 표시하지 않습니다.",
    warning: "실제 운영에서는 이 화면을 닫아도 AWS 작업이 중지되지 않습니다. 클라우드 종료 확인이 별도로 필요합니다. 이 미리보기는 AWS에 연결할 수 없습니다.",
    busy: "로컬 응답을 기다리는 중…", early: "다음 상태 확인까지 4초 기다려 주세요.", error: "로컬 확인을 계속할 수 없습니다. 작업을 재시도하지 말고 운영 기록을 확인하세요.",
    closed: "로컬 세션이 종료되거나 만료되었습니다.", ready: "준비 완료 — 미전송", accepted: "전송됨 — 합성 상태 확인 가능", running: "합성 작업 실행 중", succeeded: "합성 작업 완료 — 결과는 의도적으로 미표시",
    terminal: "합성 작업 종료 — 새로고침 후에는 성공·실패 상태를 보관하지 않음", failed: "합성 작업 실패 — 재시도하지 않음", timedOut: "합성 작업 시간 초과 — 재시도하지 않음" },
};

export function ownerJobPreviewPage(capability: string, request: JobRequest, state: OwnerJobSessionStatus, remainingMs: number): string {
  validateJobRequest(request);
  if (!/^[a-f0-9]{64}$/.test(capability) || !["READY", "SUBMITTING", "ACCEPTED", "TERMINAL", "UNVERIFIED", "CLOSED"].includes(state) ||
      !Number.isSafeInteger(remainingMs) || remainingMs < 1 || remainingMs > 120000) throw Error("OWNER_JOB_PREVIEW_PAGE_INVALID");
  // Only fixed enums/numbers are embedded, never arbitrary text or a result.
  const metadata = JSON.stringify({ request, state, remainingMs });
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="local-capability" content="${capability}"><meta name="local-preview" content='${metadata}'><title>Owner job boundary preview</title><link rel="stylesheet" href="/job.css"><script src="/job.js" defer></script></head><body><main><p id="fixture" class="eyebrow">LOCAL TEST FIXTURE — no AWS, provider or AI calls</p><div class="language"><label id="language-label" for="language">Page language</label><select id="language"><option value="en" lang="en">English</option><option value="ja" lang="ja">日本語</option><option value="ko" lang="ko">한국어</option></select></div><h1 id="page-title">Owner job boundary preview</h1><section><h2 id="intent-title">Pinned test request</h2><p id="intent"></p><h2 id="state-title">Local state</h2><p id="state" role="status">Loading…</p><div class="actions"><button id="start" disabled>Start one synthetic job</button><button id="poll" disabled>Read synthetic status</button><button id="close" disabled>Close local session</button></div></section><p id="note"></p><p id="warning" class="note"></p></main></body></html>`;
}

export const OWNER_JOB_PREVIEW_JS = `"use strict";
(() => {
  const copies = ${JSON.stringify(OWNER_JOB_COPY)};
  const get = id => document.getElementById(id);
  const token = document.querySelector('meta[name="local-capability"]'), meta = document.querySelector('meta[name="local-preview"]');
  let capability = token?.content, initial;
  try { initial = JSON.parse(meta?.content ?? "null"); } catch { initial = null; }
  token?.remove(); meta?.remove();
  let locale = "en", state = "closed", started = true, busy = false, closed = false, deadline = 0, timer, intent = "";
  let activeController;
  const originTime = performance.now();
  function render() {
    const c = copies[locale]; document.documentElement.lang = locale; document.title = c.title;
    for (const [id, key] of [["page-title", "title"], ["fixture", "source"], ["language-label", "language"], ["intent-title", "intent"],
      ["state-title", "state"], ["start", "start"], ["poll", "poll"], ["close", "close"], ["note", "note"], ["warning", "warning"]]) get(id).textContent = c[key];
    get("intent").textContent = intent; get("state").textContent = c[busy ? "busy" : state];
    get("start").disabled = closed || busy || started;
    get("poll").disabled = closed || busy || !started || !["accepted", "running", "early"].includes(state);
    get("close").disabled = closed;
  }
  function clear() { closed = true; busy = false; capability = undefined; initial = undefined; intent = ""; state = "closed"; clearTimeout(timer); activeController?.abort(); render(); }
  function active() { const now = performance.now(); if (closed || !Number.isFinite(now) || now < originTime || now >= deadline) { clear(); return false; } return true; }
  get("language").addEventListener("change", () => { locale = ["en", "ja", "ko"].includes(get("language").value) ? get("language").value : "en"; get("language").value = locale; active(); render(); });
  window.addEventListener("pagehide", clear, { once: true });
  window.addEventListener("pageshow", e => { if (e.persisted) clear(); });
  window.addEventListener("focus", active); document.addEventListener("visibilitychange", active);
  async function action(kind) {
    if (!active() || busy && kind !== "close") return;
    if (!capability) { if (kind === "close") clear(); return; }
    if (kind === "start") { if (started) return; started = true; }
    if (kind === "poll" && (!started || !["accepted", "running", "early"].includes(state))) return;
    // Close aborts acknowledgement only; no AWS StopTask or remote rollback.
    if (kind === "close") activeController?.abort();
    const controller = new AbortController(); activeController = controller;
    const requestTimer = setTimeout(() => controller.abort(), 5000);
    busy = true; render();
    try {
      const response = await fetch("/bridge/job/" + (kind === "poll" ? "status" : kind), { method: "POST", credentials: "omit", cache: "no-store", redirect: "error", headers: { "x-gmai-local-capability": capability }, signal: controller.signal });
      if (controller !== activeController || controller.signal.aborted || !active()) return;
      const body = await response.json();
      if (controller !== activeController || controller.signal.aborted || !active()) return;
      if (kind === "close") { clear(); return; }
      if (response.status === 409 && body.error?.code === "OWNER_JOB_POLL_TOO_EARLY") state = "early";
      else if (kind === "start" && response.status === 202) state = "accepted";
      else if (kind === "poll" && response.status === 200 && ["QUEUED", "RUNNING", "SUCCEEDED", "FAILED", "TIMED_OUT"].includes(body.status) && body.result === undefined)
        state = ({ QUEUED: "accepted", RUNNING: "running", SUCCEEDED: "succeeded", FAILED: "failed", TIMED_OUT: "timedOut" })[body.status];
      else throw Error();
    } catch { if (controller === activeController && !closed) { state = "error"; capability = undefined; get("start").disabled = true; } }
    finally { clearTimeout(requestTimer); if (controller === activeController) { busy = false; activeController = undefined; render(); } }
  }
  for (const kind of ["start", "poll", "close"]) get(kind).addEventListener("click", () => { void action(kind); });
  if (!initial || !Number.isSafeInteger(initial.remainingMs) || initial.remainingMs < 1 || initial.remainingMs > 120000 || !capability) { clear(); return; }
  deadline = originTime + initial.remainingMs;
  intent = initial.request.operation + " · " + initial.request.symbol + " · " + initial.request.locale;
  started = initial.state !== "READY";
  state = initial.state === "READY" ? "ready" : initial.state === "ACCEPTED" ? "accepted" : initial.state === "TERMINAL" ? "terminal" : "error";
  initial = undefined; timer = setTimeout(clear, Math.max(1, deadline - performance.now())); render();
})();`;
export const OWNER_JOB_PREVIEW_CSS = OWNER_PAGE_CSS + `.actions{display:flex;gap:12px;flex-wrap:wrap}button{font:inherit;padding:10px 14px;border-radius:7px;border:1px solid #7edfc4;background:#172338;color:#e7edf6}button:focus-visible{outline:3px solid #7edfc4;outline-offset:4px}button:disabled{opacity:.5}button:not(:disabled){cursor:pointer}`;
