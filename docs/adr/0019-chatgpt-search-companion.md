# ADR 0019 — ChatGPT-screen research and a separate private AWS lab

- Status: accepted by the user, 2026-10-25; local implementation only.
- Supersedes: the live-market-result product scope of ADRs 0015–0018, not their AWS safety controls or historical evidence.

## Context and reason

The owner wants useful personal market research and AWS learning, without
multiple provider accounts, additional personal-information disclosure or paid
APIs. Twelve Data Basic display/AI-use entitlement was unresolved. Substituting
another provider would require a fresh licensing/security decision, not solve
those concerns automatically. The user selected ChatGPT-screen results instead.

## Decision and boundaries

1. The local default page selects one fixed symbol, PRICE/ANALYZE question and
   en/ja/ko locale. It builds a visible prompt from static templates only.
2. Copy is an explicit clipboard write, replacing the previous clipboard text;
   failure leaves a selectable readonly question for manual copy. Clipboard
   contents are never read. Only the selected question is written.
3. A separate anchor opens `https://chatgpt.com/` with `noopener noreferrer` and
   no referrer. No query string, prompt, token or account ID is embedded.
4. The owner pastes and sends manually. No extension, new account, API key,
   ChatGPT automation, browser-session harvesting, scraping or answer import.
5. Web search is not Google-only or an exchange real-time feed. Prompts request
   source links, quote timestamp/timezone, currency/session, freshness labels,
   uncertainty and no invented quotes/citations. SPCX identity must be checked;
   QLD analysis includes daily-reset/leverage risks. This is not financial advice.
6. Existing fixture dashboard is a clearly separated local AWS-flow simulation.
   No new cloud synthetic worker is implied. Existing AWS code, infrastructure,
   private owner controls, circuit and prior evidence are retained unchanged.
7. No live provider call, AWS job, flag enable, circuit close, signup, subscription,
   deployment, cloud deletion or publication occurs as part of this change.

## Costs, security and limitations

The new search path adds no metered API or AWS request. Existing ChatGPT account
limits/subscription still apply; no unlimited/free availability claim is made.
Retained AWS storage can continue to incur costs; an idle app is not a zero-bill
guarantee. Normal navigation to ChatGPT exposes normal connection/account context
to that service, and the owner decides what to submit. The app does not read it.
The preview retains `connect-src 'none'`; no authentication or finance payload is
added to the bundle, localStorage, URLs or logs. Only locale preference persists.

Search results are not part of this app's state. Copy feedback means clipboard
write completion, not that search was run. The user must verify cited information.
Legacy synthetic snapshots are not current prices. UI verification does not prove
current cloud resource state or settle the deferred data license question.

## Completion and deferred work

Validate all 30 symbol/intent/locale combinations, rejected input, copy failure,
rendered entry, no outbound data API path, production build, localization and
manual browser navigation. Stop owned preview processes and verify local state.
Keep former AWS acceptance gates explicitly deferred, never mark them completed
because the product was simplified. No need to weaken IAM or buy a domain.

Later learning material: provider selection/terms → authentication/secret store
→ signed API/async job → DynamoDB/idempotency → Fargate/task roles → Bedrock
grounding → rate/retry/budget limits → failure recovery/teardown. Use synthetic
or redacted examples, no keys, account IDs or signup requirement. Its authoring
is deferred, not claimed complete. GitHub publication remains separately gated.

Official background: [ChatGPT web search](https://learn.chatgpt.com/docs/web-search).
This does not define a supported automatic submission/deep-link API; we use only
the ordinary site link and manual handoff.
