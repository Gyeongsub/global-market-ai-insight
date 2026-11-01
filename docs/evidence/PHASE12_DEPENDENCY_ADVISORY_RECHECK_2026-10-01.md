# Phase 12 dependency advisory recheck — 2026-10-01

This was a public-registry advisory check and local lockfile update. It did not
access AWS, deploy, publish, run package lifecycle scripts or scan a container
image.

## Initial result

`pnpm audit --prod --json` reported zero findings across 37 production
dependencies. The full 391-package graph reported new development-only findings
in two `brace-expansion` release lines used through ESLint/minimatch:

| Locked version | Required fixed version | Severity records | Advisory families |
| --- | --- | --- | --- |
| 1.1.18 | 1.1.21 | one moderate, two high | [GHSA-q2hr-2g5m-vwhr](https://github.com/advisories/GHSA-q2hr-2g5m-vwhr), [GHSA-qhr7-859c-m2p7](https://github.com/advisories/GHSA-qhr7-859c-m2p7), [GHSA-6j4f-fj2g-mc7p](https://github.com/advisories/GHSA-6j4f-fj2g-mc7p) |
| 5.0.9 | 5.0.12 | one moderate, two high | same advisory families |

The reports describe excessive expansion/recursion CPU or stack-exhaustion
denial of service. Every path was `dev: true`; the production audit remained
clear. This reduces direct runtime exposure but does not justify leaving build
and lint tooling vulnerable to untrusted input.

## Remediation

`pnpm-workspace.yaml` now overrides only the two affected old release selectors:

- `brace-expansion@1.1.18` → `1.1.21`;
- `brace-expansion@5.0.9` → `5.0.12`.

`pnpm install --ignore-scripts` updated the lockfile and local links without
executing package installation scripts. It downloaded the two patched package
artifacts and changed no direct application dependency. The command ran with
the available pnpm 11.19.0 runtime; `package.json` still declares pnpm 11.16.0,
so the final clean-clone proof must use the declared version and confirm an
unchanged frozen lockfile.

## Repeat result

After remediation:

- production: 37 dependencies, 0 info/low/moderate/high/critical;
- complete graph: 37 production, 354 development and 52 optional dependencies,
  0 info/low/moderate/high/critical.

Registry results are time-dependent and do not inspect container/base-image OS
packages. Repeat both dependency and exact-image scans immediately before any
deployment or GitHub publication.
