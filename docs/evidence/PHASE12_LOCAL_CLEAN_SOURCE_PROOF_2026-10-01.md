# Phase 12 generated-artifact-free source proof — 2026-10-01

## Scope and claim boundary

This is a local reproducibility checkpoint, not a Git clean-clone proof. The
project has not been frozen into an approved publication commit, and no remote,
push, workflow, registry download or AWS access was used.

The latest proof, repeated on 2026-10-02 after the Phase 11 readiness work,
copied 263
source/documentation files to a uniquely named operating-system temporary
directory. It excluded `.git`, `node_modules`, `cdk.out`, every service `bundle`,
frontend `dist`, coverage output, local tool directories, non-example `.env`
files and common private-key file types. Before building, it asserted that none
of the generated directories existed in the copy.

## Dependency boundary

The copy linked read-only to the current installed root and frontend dependency
directories. It did not download, install or update a package. Therefore it
proves that generated application/infrastructure artifacts are reproducible
from the current source with the current pinned installation, but it does not
prove that a new machine can install the lockfile from the registry.

That stronger claim remains for the final approved publication candidate:

1. freeze and commit the reviewed source set;
2. create a clean clone in a separate directory;
3. install with the pinned package manager and frozen lockfile;
4. run the full local gate and current advisory/container scans;
5. publish only after the separate security/privacy/license review and user
   approval.

## Result

The temporary copy rebuilt all service bundles and the frontend, synthesized
the credential-free CDK templates, and passed the complete local gate. The
script reported:

- AWS calls: 0;
- network calls: 0;
- cloud mutations: 0;
- generated artifacts used as inputs: false;
- dependency installation verified: false;
- publication performed: false.

The temporary directory, including dependency links and newly generated build
artifacts, was removed after the result. An initial ordinary-sandbox attempt
was blocked at the native controller bundler; the same local proof then passed
with the approved local build execution boundary. No test assertion or source
behavior was weakened to obtain the pass.

Reusable command:

```text
pnpm check:clean-source
```

The command accepts no arguments and suppresses raw child build output on
failure, reporting only the bounded failed stage.

The 2026-10-02 repetition passed the full 325-test gate with zero AWS, network
or cloud-mutation calls. It removed the temporary copy afterward. This remains
a current-installation reproduction, not a clean-clone dependency-install
claim and not publication approval.
