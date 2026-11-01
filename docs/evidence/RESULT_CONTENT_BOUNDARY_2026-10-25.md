# Local nonblank result-content boundary — 2026-10-25

A zero-network synthetic probe reproduced three accepted malformed results:
`risks: [""]`, an all-space summary, and an all-space uncertainty statement.
The model parser already requires substantive compact strings, but the persisted
public-result contract was weaker. A schema-valid shape could therefore show an
empty mandatory section. No actual provider/model response or cloud record was
queried, and no live incident is asserted.

The shared analysis schema now gives every list item minLength 1 plus a non-space
pattern, and requires a non-space character in summary, uncertainty and modelId.
The price schema applies the same requirement to source. The existing generic
validator already implements these schema features; there is no second UI-only
validation rule, new dependency or hidden fallback text. Optional empty lists,
valid multilingual text, existing maximum lengths and exact disclaimers remain.
The pattern rejects whitespace as defined by the existing JavaScript RegExp
engine; it does not prove truth, substantive financial reasoning, provenance,
language identity or the absence of every Unicode formatting character.

The added regression first failed on the old contract. After correction, 40
shared schema, renderer, API client and repository tests passed. Blank ASCII,
tab/newline, nonbreaking and ideographic whitespace are tested. Normal generated
grounded results remain valid in all 15 symbol/locale combinations. Browser GET
rejects blank-source responses; the repository rejects a blank source in stored
resultJson; renderer rejects blank summary/risk/uncertainty without partial prose.
Tests use local memory/injected senders, not AWS services. The final schema-source
current-installation gate passed all 90 steps and 1,446 tests (1,445 pass / one
existing privilege skip), with 33 loopback HTTP checks, no external calls and
201,049 ms under the unchanged 360,000 ms bound. Private receipt
`ea15660e-ff47-4618-a775-be0086c26245.json` completed 2026-10-24T23:22:15.718Z.
Its source was 649 files / 6,113,833 bytes, fingerprint
`cb2e1b3dd773ec0880979cbeed410d1717e8fadea8ccd0bc96056e722f49d0b1`.
Current-source comparison passed before handoff-only Markdown changes. Independent
inventory at 23:23:00.1222185Z found all ten residue counts zero, two assistant
processes excluded and two empty parent directories retained. This final gate
uses the current installation; it is not a new frozen clone or publication proof.

Compatibility is deliberately stricter for previously accepted malformed values.
No old cloud data was inspected or rewritten. This is undeployed hardening under
the existing local-only restriction, not a versioned rollout approval. It does not
change admission, retry, task count, token caps, IAM or any financial commitment.
Earlier [layout proof](ANALYSIS_CARD_LAYOUT_2026-10-25.md) predates this revision.
