# Global Market AI Insight — current project plan

Updated 2026-11-01. This is the current scope and next-work map, not a new
deployment approval. [agent.md](agent.md) defines execution rules.

## 1. Current product and scope precedence

The approved private portfolio has two active paths:

1. **Search companion:** local English/Japanese/Korean questions for five fixed
   symbols, manual copy/paste into ChatGPT, results and sources read in ChatGPT.
   No automatic sending, account/session reuse, answer import or data/search API.
2. **Real AWS synthetic learning:** a trusted-owner loopback page performs one
   explicit Tokyo Nova Lite analysis of a fixed invented QLD snapshot. A temporary
   model-only IAM role/STS lease, local broker, validated output and automatic
   cleanup keep browser credentials and long-running work out of this path.

The separate offline flow simulator is a fixture, **not** real inference.
Earlier API Gateway/Lambda/DynamoDB/Fargate/provider infrastructure and source
remain a **disabled learning track**. Do not activate it, claim it is the current
search backend or require every historical experiment for private completion.

Decisions: [no-domain private access](docs/adr/0017-local-owner-aws-bridge.md),
[manual ChatGPT handoff](docs/adr/0019-chatgpt-search-companion.md),
[synthetic Bedrock lab](docs/adr/0020-synthetic-bedrock-local-lab.md),
[model-only role boundaries](docs/adr/0021-synthetic-lab-least-privilege-candidate.md).

## 2. Why the scope changed

AWS learning remains the purpose. Live quote APIs introduced display/AI-use
licensing uncertainty, extra accounts/personal-information disclosure and cost
management disproportionate to this private project. The owner chose existing
ChatGPT search for current research, with synthetic data for real AWS practice.
No additional API signup, paid data subscription, domain purchase or public
hosting is required. Search is not guaranteed real-time data or exclusively
Google search. Model output is educational, not personalized investment advice.

## 3. Architecture and boundaries

- Search: browser → local deterministic prompt → explicit manual ChatGPT handoff.
- Actual lab: owner browser → exact loopback broker → HTTPS/SigV4 → Tokyo Nova
  Lite → validated insight IDs → locally rendered localized result.
- Control: privileged owner CLI manages only the gated temporary-role lifecycle;
  the inference process receives a separate model-only lease, not owner keys.
- Retained lab: API Gateway → controller Lambda → conditional DynamoDB job →
  short-lived Fargate worker → provider/Bedrock, with operations/circuit controls.
  This fourth path is retained history/optional learning, not silently re-enabled.

[Architecture](docs/architecture.md), [API contracts](docs/api.md),
[threat model](docs/threat-model.md), [private completion map](docs/PRIVATE_PORTFOLIO_STATUS.md).

## 4. Non-negotiable security, privacy and cost controls

- Only the trusted owner's PC; bind to 127.0.0.1, no LAN exposure, tunnel, automatic
  startup, permanent service or public credentials. Local HTTP is the explicit
  loopback exception; AWS communication remains HTTPS.
- Synthetic lab: fixed QLD/input/model/region, one attempt including failure,
  no SDK retry, output at most 512 tokens, request at most 8192 bytes, 20-second
  model deadline, at most five-minute local lifetime.
- The STS credential lifetime (15 minutes), absolute session-policy authorization
  window (five minutes) and application's one-attempt control are different.
  Process close or IAM-role deletion is not universal instantaneous revocation.
- No provider key or free-form personal financial data enters the synthetic lab.
  No provider calls, admission/display enablement or circuit close for this work.
- Retain separate roles, strict schemas/output escaping, bounded errors/logs,
  exact ownership checks and default-inert operator commands.
- No always-on ECS service, ALB, NAT Gateway, subscription, hosted website or
  permanent new role. Retained S3/ECR/DynamoDB/log storage can still cost money.
- USD 5 alerts and the old API/Fargate circuit are not global hard spending caps.
  Use dated measurements; accepted work and billing can appear after shutdown.
- SPCX identity is unverified: never infer its issuer/listing, fabricate a quote
  or substitute another symbol. The offline simulator returns DATA_UNAVAILABLE.
- Do not publish on GitHub until completion, final security/privacy/license
  review and the owner's separate upload approval. No remote/workflow/push now.

## 5. Verified status and remaining work

| Area | Verified scope | Still open |
| --- | --- | --- |
| Search companion | Three locales, fixed questions, manual handoff, copy/fallback, keyboard and narrow-layout review | Not ChatGPT result quality, complete accessibility certification or live quote integration |
| Private AWS lab | October 31 English restricted-role browser analysis, one request after refresh/reload, cleanup and independent deletion | Not every locale/mobile on the restricted role or synthetic Fargate integration |
| IAM boundaries | Dated forbidden reads, alternate-principal and compute rejection; successful analysis followed by explicit time-window denial | Not universal action/principal proof or revocation of all sessions |
| Local quality | November 1 patched working-tree gate: 90 steps; 1,905 passes, one existing skip; 33 loopback checks closed | Later documentation and the transformed public copy need their exact frozen-install proof; earlier clone receipts are not substitutes |
| Dependencies | November 1 approved refresh: one moderate dev-only minimatch finding, no declared-runtime match; exact-version backport passed focused and working-tree tests | Public-copy frozen verification and final residual-risk decision; registry matches are retained |
| Publication | Candidate inventory and private image/SBOM inspection; no upload | Exact artifact/privacy/history/rights/notice review and explicit upload consent |

An earlier service-test failure has no established cause. Later passes do not
explain it. The reproduced October 31 Windows junction permission failure is a
different observation; preserve failed receipts rather than reclassifying them.

Evidence: [restricted browser](docs/evidence/SYNTHETIC_RESTRICTED_BROWSER_2026-10-31.md),
[advisory](docs/evidence/LINT_ADVISORY_REVIEW_2026-10-31.md),
[lint containment](docs/evidence/LINT_EXECUTION_BOUNDARY_2026-11-01.md),
[publication artifacts](docs/evidence/PUBLICATION_ARTIFACT_REVIEW_2026-10-31.md).

## 6. Next work, in priority order

1. Complete the Korean portfolio narrative and evidence navigation using the
   accepted private implementation. Owner exercises occur after release, not as
   a prerequisite. Do not expand the implementation with optional historical work.
2. Resolve the development-only minimatch advisory with a compatible remedy or
   an explicit, documented release-risk decision. Do not force a major version,
   drop lint coverage or silently suppress the finding to obtain green.
3. Define the exact source-only GitHub candidate and finish privacy/history/
   rights review. Review distributed binaries separately; preserve private
   originals and do not represent omitted artifacts as cleared.
   November 1 owner approval selects source, tests and the Korean portfolio only;
   exclude private local records, generated builds and containers. Preserve the
   original cover image and historical SBOM locally; review public copies
   separately. This is preparation approval, not an upload of an unreviewed tree.
4. Verify the final candidate from an isolated frozen install, then obtain the
   required exact publication approval and publish source plus portfolio. No
   automatic workflow, public web hosting or AWS deployment is implied.
5. Before any later actual AWS operation: fresh matching source proofs, identity,
   bounded calls/costs, verified cleanup route and required specific authority.
6. Perform final safe stop and report Security/Cost facts and limitations.

No routine permission request is needed for in-scope local work. Tool security
review, authentication/MFA, new disclosure and explicit publication boundaries
cannot be bypassed by general autonomy.

## 7. Verification and safe stopping

- Supported lint: `pnpm lint`; fixed frontend/config, minimal child environment,
  60-second deadline, 512-MiB V8 old-space limit, no auto-fix/cache/arbitrary args.
  This is not total-memory/OS isolation or a vulnerability patch.
- Current gate: `node scripts/local-gate-proof.mjs --execute-local`.
- Independent local snapshot/clone plus frozen install:
  `node scripts/local-git-clone-proof.mjs --execute-local-git-frozen-proof`.
- Both preserve source fingerprints, all ordered steps, errors and cleanup.
  A source edit invalidates exact-source live authorization; no old receipt reuse.
- Stop local listeners/helpers and clear project CLI authentication after cloud
  work. Keep role-management processes alive until owned-role/stack cleanup
  completes; independently confirm deletion and relevant cloud/local inventory.
- Console login is separate from CLI login. Do not request long-lived keys,
  share credentials in chat or claim console logout from a closed tab.
- Confirm what was actually read. Local tests cannot certify current AWS state,
  all-region zero cost or universal credential revocation.
- Check available weekly usage periodically; start safe closure by the user's
  remaining-20% threshold or immediately on a stop instruction. Unknown quota
  is not zero or permission to run until interrupted without cleanup.

## 8. Learning and handoff

[README](README.md), [demo script](docs/demo-script.md),
[Korean API/AWS guide](docs/API_INTEGRATION_LEARNING_GUIDE_KO.md),
[local Architect walkthrough](docs/LOCAL_ARCHITECT_WALKTHROUGH.md),
[synthetic runbook](docs/runbooks/synthetic-bedrock-lab.md),
[cost model](docs/cost-model.md), [operations runbook](docs/runbook.md).

Explain service choices, request/data/control flows, IAM failure boundaries and
cost tradeoffs. Reading or agent automation is not proof that the owner personally
completed an exercise. The owner's November 1 decision explicitly postpones
personal practice until project completion, security-reviewed GitHub publication
and portfolio delivery. Do not stop implementation to request an exercise.
Use the [Korean portfolio](docs/PORTFOLIO_CASE_STUDY_KO.md) as the later reading map.

## 9. Historical requirements and evidence preservation

The previous complete plan, including Phase 0–13, detailed contracts, chronological
checkpoints, failed attempts and uncompleted retained-lab checklists, is preserved
in [the historical plan](docs/history/PLAN_THROUGH_2026-11-01.md).
Only relative Markdown link destinations were rebased for its new location.
Current decisions above take precedence; historical approvals/receipts are not
reusable live permits. No historical checkbox was silently marked completed.

## 21. Current acceptance checklist

- [x] Fixed symbols and three locales; source/time/uncertainty/SPCX safeguards.
- [x] Manual copy/fallback and plain ChatGPT link, no automatic transmission.
- [x] Search, offline simulation and actual AWS synthetic paths distinguished.
- [x] Dated English restricted-role browser analysis and independent cleanup.
- [x] Local tests/build and focused browser review; limitations explicitly retained.
- [x] API/IAM/cost learning materials and shutdown instructions available locally.
- [ ] Final current-candidate security/privacy/dependency/notice review.
- [ ] Final explicit GitHub upload approval and publication (deferred, not done).
- [ ] Finished portfolio delivered with the verified public source revision.

All-language restricted-cloud/mobile acceptance, remote CI, provider/Fargate
end-to-end, CloudFront/custom domain and Phase 13 service comparison remain
separate optional/deferred gates, not completed by the scope change.

## 25. Definition of Done

A reproducible, explainable private portfolio: source-aware multilingual manual
ChatGPT handoff plus bounded real AWS analysis of invented data, with validated
output, least-privilege inference, independent cleanup and honest dated cost/
security evidence. No claim of current market prices, unrestricted AI analysis,
fully completed historical AWS experiments or account-wide risk elimination.

Private functional acceptance and public release are different milestones.
The former has dated evidence; the latter remains gated by final artifact,
privacy, dependency and rights review plus the owner's explicit upload approval.
For the current autonomous run, completion means both milestones and the finished
portfolio, excluding the owner's later practice. Continue meaningful in-scope
work until that completion, a user stop or weekly remaining usage at/below 20%.
If an external permission/authentication gate prevents all remaining work, report
the precise blocker rather than inventing approval or claiming completion.
