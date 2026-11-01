# Known Local Limitations

- The site is intentionally fixture-only even though the private provider key
  and bounded internal worker path were previously validated. Browser
  authorization and public data-display rights are separate unresolved gates.
- Public live quotes are additionally blocked because the current Twelve Data individual plans do not grant external-display/redistribution rights. A valid key alone is not sufficient authorization.
- Local UI Bedrock output remains deterministic fixture content. Bounded Nova
  Lite ANALYZE jobs were previously verified in Tokyo, but the current changed
  source has not been rebuilt, scanned or redeployed.
- A digest-pinned non-root Distroless image and bounded Fargate runs have dated
  August evidence. The August 30 ECR image scan does not clear the current
  source; a fresh image build/history/scan remains required before release.
