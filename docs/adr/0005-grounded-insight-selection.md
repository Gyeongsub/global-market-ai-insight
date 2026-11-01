# ADR 0005: Allowlisted insight selection and deterministic localized rendering

- Status: Accepted
- Date: 2026-08-22

## Context

Bounded Nova Lite evaluations showed two different failure classes.

1. Free-form JSON text could be syntactically invalid.
2. Forced tool use fixed the schema shape, but free-form text still introduced unsupported relationships, freshness claims, promotional language, and suitability judgments.

Adding more prompt wording and language-specific blocked phrases cannot prove that a new paraphrase will be safe. Model output therefore remains untrusted even when its JSON is valid.

## Decision

Bedrock does not author user-visible analysis prose in the first portfolio release. It may select and order only application-approved insight identifiers through a forced tool call.

The worker then:

1. validates exact selection keys, identifier allowlists, duplicates, and symbol/quote prerequisites;
2. requires baseline market-risk, provenance, and uncertainty identifiers;
3. requires QLD leverage downside, path dependency, and daily reset identifiers;
4. renders user-visible English, Japanese, or Korean text from application-owned templates and normalized quote values;
5. attaches canonical metadata and disclaimer in application code;
6. runs the existing final output validator before persistence.

Unknown or insufficient selections fail safely as `BEDROCK_INVALID_OUTPUT`. The adapter performs one transport call and has no automatic paid retry.

## Consequences

### Positive

- Model-authored benchmark names, return expectations, suitability statements, and freshness claims cannot reach the UI.
- Language consistency and financial-safety review become deterministic and testable.
- Provider timestamps, freshness, and provenance retain application authority.
- Bedrock token usage and failures remain observable without logging raw prompts or model output.

### Tradeoffs

- Model creativity and natural-language variation are intentionally limited.
- New insight types require reviewed identifiers and three localized templates.
- With a small fixed policy, Bedrock's selection value is modest; this is accepted in favor of safety and demonstrable governance.
- The AWS SDK transport and container bundling remain a separate implementation gate; the current adapter core uses an injected Converse-compatible transport for local integration tests.

## Rejected alternatives

- **Prompt-only free-form JSON:** repeated syntax and grounding failures.
- **Tool schema with free-form text fields:** valid JSON but unsafe or unsupported prose remained possible.
- **Growing multilingual regex blocklists:** useful defense in depth but cannot cover unseen paraphrases.
- **Passing raw model text through a repair call:** adds cost and can create another untrusted output.

## Evidence

- `services/worker/src/grounded-analysis.ts`
- `services/worker/src/providers/bedrock-analysis-adapter.ts`
- `services/worker/src/worker-operation.ts`
- Mocked provider/Bedrock integration and negative tests
- 2026-08-22 local verification: service/contract 33, infrastructure 4, frontend 4, build and one-shot worker smoke all passed
- No AWS login, provider call, Bedrock inference, deployment, or additional cost was used for this implementation
