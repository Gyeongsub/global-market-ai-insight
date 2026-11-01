# ADR 0004: Tokyo Region and Nova Lite

- Status: Accepted and verified for the private dev workflow
- Date: 2026-08-08
- Verification updates: 2026-08-22 and 2026-09-10 through 2026-09-13

## Decision

Use `ap-northeast-1` (Tokyo) as the dev Region and Amazon Nova Lite as the first Bedrock model. Application configuration retains a logical model alias so lifecycle or model changes do not leak through the domain contract.

## Why

Tokyo aligns with the project owner's operating timezone. AWS currently documents Nova Lite as an active low-cost model with in-region Tokyo availability.

## Validation outcome

- Account access and bounded on-demand inference were confirmed on 2026-08-22.
- Forced tool-use/schema behavior was evaluated in English, Japanese and Korean;
  free-form generation was rejected in favor of allowlisted insight IDs and a
  deterministic renderer.
- Signed private ANALYZE jobs succeeded for Korean, English and Japanese on
  2026-09-10, 2026-09-12 and 2026-09-13 respectively.
- Retain application-level validation because the model card does not list native structured outputs.
- Keep prompts small and cap output tokens; do not enable provisioned throughput.

These dated checks do not guarantee current model lifecycle, quota or price.
Recheck official Region/model/pricing data before a new deployment or call. See
[the first access evidence](../BEDROCK_SMOKE_TEST_2026-08-22.md) and
[the bounded QLD/ko acceptance](../evidence/PHASE8_ANALYZE_ACCEPTANCE_2026-09-10.md).
