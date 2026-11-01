# Fixture client environment boundary — 2026-10-18 Tokyo

Local privacy hardening only, not evidence of a real credential incident,
deployment, disclosure, complete browser security or publication approval.
The current fixture application does not need client deployment variables.

Two new red tests reproduced the default configuration accepting synthetic
VITE-prefixed process/file values as client environment inputs. No real key or
user env file was used. The reviewed local Vite configuration now sets
`envDir: false` and `envPrefix: []`; the empty array is **not an empty string**.
There is no explicit `define` replacement of process environment. Built-in
Vite mode/base/dev/prod flags remain framework behavior, not arbitrary secrets.

The pinned Vite's actual `loadEnv` is exercised in production/development modes
against six exclusively created synthetic env files and one temporary process
sentinel. The tests verify that neither sentinel is selected, restore the
prior process value and remove only their verified synthetic files/directory.
The user's env files, original images and private state are untouched. Both
red tests pass after the two configuration changes; preview policy tests and
frontend TypeScript also pass. No user-visible product feature/API contract,
hosting resource, HMR policy or paid dependency changes.

The [Vite 8 shared options](https://v8.vite.dev/config/shared-options#envdir)
document false envDir disabling dotenv loading and envPrefix controlling
client exposure. Local installed option types and actual behavior were checked;
this is not a claim that every secret in arbitrary future source/public assets
would be blocked. Future public configuration requires an explicit allowlist
and renewed review rather than restoring a generic secret prefix. Full build,
HTTP, source/privacy/license/history and publication reviews remain separate.
