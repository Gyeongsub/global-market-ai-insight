# Phase 12 dependency advisory recheck — 2026-09-24

This is a local dependency-lockfile and public-advisory review, not a container-image scan, deployment, GitHub publication, or proof that future advisories will remain clear. No AWS resource or paid service was changed.

The initial `pnpm audit --prod --json` against the current registry advisory service returned zero findings for 37 production dependencies. The full `pnpm audit --json` found two **high** advisories in development-only indirect dependencies:

| Package and prior lock | Inbound tooling path | Patched version pinned | Advisory |
| --- | --- | --- | --- |
| `nanoid` 3.3.17 | Vite/PostCSS | 3.3.18 | [GHSA-2v37-7h3g-55p8](https://github.com/advisories/GHSA-2v37-7h3g-55p8) |
| `js-yaml` 4.3.1 | ESLint config loader | 4.3.2 | [GHSA-2883-xcg3-v3hh](https://github.com/advisories/GHSA-2883-xcg3-v3hh) |

The root `pnpm-workspace.yaml` now explicitly overrides these two transitive versions. `pnpm install --ignore-scripts` updated `pnpm-lock.yaml` and the local dependency tree without running package installation scripts. A repeat full audit reported **0 info / low / moderate / high / critical** advisories (37 production, 354 development and 52 optional dependencies reported by the audit). The official advisories describe availability/CPU-consumption issues and list these patched versions; they do not prove an exploit was reachable through this project's build process.

The project's full local checker subsequently passed **268 tests** with the patched dependency tree, plus type, lint, bundle, synth, local build and secret-pattern checks.

Remaining gates: scan the exact future worker image and dependency lock again immediately before deployment/publication. A registry audit is advisory-data dependent and does not inspect base-image operating-system packages, browser behavior, source content, or provider display rights.
