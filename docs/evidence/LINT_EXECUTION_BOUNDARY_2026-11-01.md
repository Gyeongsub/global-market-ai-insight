# Trusted local lint execution boundary — 2026-11-01

## Compatibility decision

The official [advisory](https://github.com/advisories/GHSA-g3hv-75wg-m249)
still lists minimatch below 11.0.1 as affected. A single anonymous public package
metadata GET found legacy-v3 3.1.5, newest stable 10.x 10.2.6 and latest 11.0.3.
The first local GET failed DNS resolution; the permitted GET succeeded. This was
not another bulk inventory submission and did not disclose project source or
the dependency graph. No package was installed or lockfile changed.

The [upstream changelog](https://raw.githubusercontent.com/isaacs/minimatch/main/changelog.md)
documents removed APIs and changed matching behavior in major 11. The open
[ESLint issue](https://github.com/eslint/eslint/issues/21463) includes a contributor's
ESLint 10 override experiment. That is not acceptance of this project's ESLint 9,
legacy callable 3.x consumers, plugins or complete Windows matching semantics.
Do not force every consumer to 11, suppress the finding, or assume a fixed 10.x.
No private fork/backport is introduced in this change.

## Implemented containment, not a patch

Root/frontend `pnpm lint` now use the same fixed command as the full local gate:

- Explicit repository frontend directory and ESLint configuration; no arbitrary
  appended paths, patterns, config, automatic fixes or cache options.
- One child with a 60-second wall-clock limit, no retry and a 512-MiB V8 old-space
  ceiling. This is not a total-process memory cap or an operating-system sandbox.
- The existing minimal child environment removes inherited AWS credentials,
  provider secrets, Node preloads, proxy and tool-specific environment settings.
  The trusted OS user can still read its files; no credential-file isolation is claimed.
- The whole gate directly runs that child. It does not nest another launcher;
  the actual deadline is the smaller of the remaining whole budget and 60 seconds.
  A late zero exit cannot establish success. Other check scopes/order and the
  existing ten-minute whole budget are unchanged.

`node scripts/frontend-lint.mjs` is an inert plan. Execution requires
`--execute-local-lint`; ordinary package lint commands already supply it.
Direct invocation of the installed ESLint executable bypasses this wrapper and
is not the supported bounded command. Only trusted local source/configuration
may be used; this does not make unreviewed code safe to execute.

Focused validation: 24 tests passed, zero failures/skips, covering the current
matcher boundary, fixed command, timeout/resource failures, no retries, invalid
budgets, late acknowledgement and inert CLI. The actual lint command passed in
17,508 ms. No amplification or memory-exhaustion payload was run. Whole-source
and clean-install verification are separate pending steps at this checkpoint.

## Security and cost

### Same-day supported-upgrade review

Six anonymous, bounded public `latest` metadata GETs were used to check the
upstream upgrade path, not the private dependency inventory or bulk audit API.
No package installation or manifest/lock modification followed this review.

| Public package | Observed latest | Relevant published boundary |
| --- | --- | --- |
| eslint | 10.14.0 | Still depends on minimatch `^10.2.6`, below the advisory's fixed major |
| @eslint/js | 10.0.1 | Requires ESLint `^10.0.0` |
| typescript-eslint | 8.72.1 | Supports ESLint 8.57/9/10 and TypeScript >=4.8.4 <6.1.0 |
| eslint-plugin-react | 7.37.5 | Declares ESLint peers through 9.7, not 10; minimatch `^3.1.2` |
| eslint-plugin-react-hooks | 7.1.1 | Declares ESLint 10 support |
| eslint-plugin-jsx-a11y | 6.10.2 | Declares ESLint peers through 9, not 10; minimatch `^3.1.2` |

The [official ESLint migration guide](https://eslint.org/docs/latest/use/migrate-to-10.0.0)
also documents configuration, recommended-rule and plugin API changes.
[typescript-eslint's supported-version policy](https://typescript-eslint.io/users/dependency-versions/)
does not confer compatibility on the separate React/accessibility plugins.
The exact npm version documents can be retrieved at
`https://registry.npmjs.org/<encoded-package-name>/<version>`.

Conclusion: upgrading only ESLint to the newest major would neither remove the
reported matcher dependency nor preserve all declared plugin peer ranges.
No peer check is disabled, accessibility/React rule coverage removed or blanket
matcher override introduced. Wait for a compatible upstream remedy or separately
review a justified tooling migration; this is not evidence that latest is unsafe
in every use or that the current advisory can be marked resolved.

The moderate advisory remains unresolved; the October 31 one-shot bulk approval
is consumed. No new bulk request, AWS authentication, model/provider call, IAM
change, deployment, GitHub upload or new paid resource was made by this work.
Existing cloud state and delayed/storage costs are not verified by local lint.
