# Docker Desktop — bounded local runtime recovery

Date: 2026-10-04, Asia/Tokyo. The user supplied a startup error screenshot and
requested repair during today's local container-validation preparation.

The error named the Inference manager's `dockerInference` runtime endpoint.
Local metadata showed three socket-like ReparsePoint entries in Docker's `run`
directory and one `engine.sock` entry in `docker-secrets-engine`. This closely
matches [the report on Docker's issue tracker](https://github.com/docker/desktop-feedback/issues/460).
That report is third-party reproduction evidence, not proof of a particular
Windows kernel/root cause on this computer or an instruction/authorization.

The installed Docker CLI had a valid Authenticode signature and the selected
engine connection was the local `dockerDesktopLinuxEngine` named pipe. Before
recovery, its info call returned nonzero with no healthy Linux server. The
owned unsuccessful start command was cancelled; read-only process inventory
confirmed no Docker Desktop/backend/build process remained before file changes.
No global WSL shutdown, unrelated process kill or factory reset was performed.

Only two explicitly named transient runtime directories were renamed to
same-parent backups: `run.stale-20261004-083443` (three preserved entries) and
`docker-secrets-engine.stale-20261004-083443` (one). Fresh empty directories
were created. Physical, non-directory-link source/backup shapes, sibling
containment and before/after entry counts were independently verified. Nothing
was deleted; the old runtime entries remain recoverable for local diagnosis.
The operation did not rename Docker's data root or touch its VHDX, images,
container storage, settings or existing backup.

The initial PowerShell parent-path validation used an unsupported parameter
combination and emitted nonterminating errors; this is not counted as a clean
validation pass. The rename itself used exact literal sources and same-parent
names. A subsequent fail-fast verification used explicit fixed source/backup
paths and IO path APIs and confirmed all intended boundaries/counts before
restart. Future recovery must use fail-fast validated operations, never ignore
validation errors, recurse through socket reparse points or broaden deletion.

The documented detached Desktop start completed with exit zero. Independent
local engine info then returned **Linux / server 29.6.2 / zero running
containers**. No image pull/build/push or task was performed merely to prove
startup recovery. No permission/TLS/security-monitoring change, software
upgrade, gathered diagnostic upload or new paid subscription was used.
Desktop can still perform background behavior under its preexisting settings;
this record does not claim all product telemetry/update traffic was disabled.

This is a successful scoped startup recovery, not a permanent OS/SDK fix or
guarantee against recurrence. Preserve the backups; do not copy their old
sockets over a working runtime. Any later rebuild/image scan and graceful
Desktop stop are separate results, recorded in today's closing evidence.

The all-depth context exclusions were also strengthened in both Docker ignore
files: private AWS/assistant state, registry configuration, credentials,
certificates, state backups and logs stay out even if later placed beneath
source COPY roots. A local source-contract test requires these patterns and
rejects any negation that could re-include them. This checks configured guards,
not a Docker-transferred context or current container-image scan.
[Official context/exclusion semantics](https://docs.docker.com/build/concepts/context/).

## Restart regression and final stopped state

The recovered engine completed two local image builds and archive scans, then
gracefully stopped with exit zero. A further normal detached restart reproduced
the exact Inference-manager endpoint removal failure. Its private local host
log was examined category-only: four matching errors were dated around
`2026-10-04T00:01:12Z`–`00:01:19Z`. This independently establishes recurrence;
the earlier successful startup is **not a permanent repair**.

The recheck could not prove a healthy second start. The graceful-stop command
also failed to complete successfully, so only the eight observed processes
created by that owned restart were terminated after exact installed executable,
PID and creation-window validation. Independent inventory confirmed no Docker
Desktop/backend/build process remained. No unrelated process or WSL instance,
container/data store, VHDX, security policy or factory setting was touched.

With Desktop stopped, both transient runtime directories were again physically
validated before mutation and moved to same-parent backups ending
`stale-20261004-0910`; three and one old entries were preserved. Fresh originals
were verified physical and empty. All four backups (initial and recurrence)
remain recoverable, and nothing in those directories was deleted. This leaves
the demonstrated clean-start workaround prepared, **not verified as a durable
reboot/restart fix**. Docker is intentionally stopped at handoff.

Next Docker scope should investigate the installed Desktop/Windows compatibility
and an official fixed release before relying on unattended starts. No system
update, reinstall, diagnostic upload or broad reset was attempted today.
