# Local Docker transient-socket recovery

## Observed issue and boundary

On 2026-10-04 Docker Desktop 4.85.0 again failed while initializing its
`dockerInference` Windows Unix-domain endpoint. A later endpoint can similarly
fail at `engine.sock`. The engine recovered after the failed owned processes
exited and the two **transient** directories were moved to recoverable sibling
backups. Engine 29.6.2 responded normally. This is a local workaround, not proof
that the upstream restart defect is permanently fixed.

No factory reset, WSL/data-root/VHDX deletion, image/volume pruning, security
setting change, diagnostics upload, new Docker account or subscription is
needed for this scoped workaround. Earlier backups are retained. Do not
delete them or unrelated Docker data as an automatic fallback.

## Reusable, stopped-only preparation

`scripts/docker-transient-preflight.mjs` has a default **zero-action** plan.
The sole explicit argument is `--execute-stopped-socket-backup`. Use it only
after independently confirming Desktop/backend stopped and before starting
Desktop normally. It never kills or starts a process itself.

Its trusted project-local PowerShell automation accepts only these exact
physical current-user directories and zero-byte socket entries:

| Directory under LocalApplicationData | Allowed entries |
| --- | --- |
| `Docker/run` | `dockerEthernetVfkit`, `dockerInference`, `userAnalyticsOtlpHttp.sock` |
| `docker-secrets-engine` | `engine.sock` |

Unexpected files, directory links, moving content, active Desktop/backend,
existing destination or an unresolved path block the operation. Each backup
is a same-parent atomic rename with a new random scope, not recursive deletion
or traversal into socket targets. Only two directories can be moved.

The Node entry executes the inspected local automation as ordinary inline
commands, as used elsewhere by the project operators. It does **not** change
Windows execution policy or request a Bypass setting. Do not weaken host
policy to run the `.ps1` directly. On an independently managed policy denial,
keep the tool blocked and retain the original directories.

After starting normally, independently confirm local engine health, exact
cached image identity and no remaining owned scanner. A failed start is not
permission to reset data. Future upgrades/reinstallation or uploading private
diagnostics are separate decisions; they are not part of this helper.

Official references: [Desktop stop and bounded timeout](https://docs.docker.com/reference/cli/docker/desktop/stop/),
[Desktop start](https://docs.docker.com/reference/cli/docker/desktop/start/),
[troubleshooting and destructive reset/diagnostic distinctions](https://docs.docker.com/desktop/troubleshoot-and-support/troubleshoot/).
