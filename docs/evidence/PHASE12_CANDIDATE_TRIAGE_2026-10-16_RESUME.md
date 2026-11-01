# Retained candidate vulnerability triage — 2026-10-16 resumed session

Local static inspection only, not a new image build, application execution,
private registry scan, deployment, waiver or publication decision. The retained
October 16 artifact was not overwritten or retagged. Later application changes
in this session are NOT covered by its image scan or earlier source fingerprint.

## Measured fixed-artifact result

The independently reread ignored receipt is
`outputs/local-gates/triage-4dea21ff-b6d6-489a-8c15-d8496287d838.json`.
It completed at 2026-10-16T12:21:38.232Z, after starting 12:20:13.223Z.
Seven local Docker calls, zero AWS calls/builds/pulls/pushes/application runs or
credential retrievals. The exact runtime and config digests remain those in the
[original candidate record](PHASE12_CURRENT_WORKER_CANDIDATE_2026-10-16.md).
Hash-verified archive/config and ordered 22-layer public-base prefix passed.
The cached scanner's label reports 0.72.0; its immutable ID/entrypoint/platform
were checked, not independently established as publisher-signature provenance.

Fresh database: 14 OS packages, HIGH/CRITICAL/UNKNOWN/secrets zero; MEDIUM 23 and
LOW 8 retained. These are **31 package/CVE occurrences, 25 distinct CVE IDs**,
not 31 distinct CVEs. No duplicate finding was dropped, no severity/status
filter or ignore file was used, and all 31 have no fixed version advertised in
this target-release scan. That last fact is not a claim that upstream has no fix.

| Binary package group | Source package | MEDIUM | LOW | Review outcome |
| --- | --- | --- | --- | --- |
| gcc-14-base, libgcc-s1, libgomp1, libstdc++6 | gcc-14 14.2.0-19 | 8 | 0 | Two CVEs repeated across four binaries; not deduplicated away |
| libc6 | glibc 2.41-12+deb13u4 | 13 | 8 | All 21 occurrences retained |
| zlib1g | zlib 1:1.3.dfsg+really1.3.1-1 | 2 | 0 | Installed binary additionally has +b1; source version remains separate |

The 31 bounded rows include only CVE ID, public package/source coordinates,
severity, status and optional fixed version. Target names, private paths, raw
descriptions, URLs, secret matches, maintainers, account details and environment
are not copied. Complete application dependency/OS licensing, source/build/key
provenance, live-image matching, execution and release remain unverified/false.

## Official-source review and conservative decision

The official Debian trackers for [glibc](https://security-tracker.debian.org/tracker/source-package/glibc),
[gcc-14](https://security-tracker.debian.org/tracker/source-package/gcc-14) and
[zlib](https://security-tracker.debian.org/tracker/source-package/zlib) were read.
They continue to list these target-trixie issues as vulnerable, including
no-DSA/minor entries. A fix in forky/sid is not a reviewed compatible replacement
for this pinned trixie runtime. No mixed-distribution upgrade was attempted.

For example, [CVE-2026-95818](https://security-tracker.debian.org/tracker/CVE-2026-95818)
and [CVE-2026-86805](https://security-tracker.debian.org/tracker/CVE-2026-86805)
describe dynamic-loader/local privileged-program prerequisites. Nonroot/read-only/
no-new-privileges settings reduce exposure, but do not independently prove every
prerequisite absent or every native-library call unreachable. No exploit was run,
no VEX/not-affected statement was created, and neither finding is waived.
Full per-CVE call-path/binary/source applicability is still unknown.

## Parser correction and failure preservation

The first actual report was incomplete and its ignored failed receipt remains
`triage-ff501f9a-bf51-4746-8559-588ae24095fb.json`. Later fixed-stage diagnostics
isolated report/finding-coordinate validation. None of those failures is a pass.
The new triage parser initially treated inventory Version as a complete Debian
version. Official pinned scanner source shows otherwise:
[FormatVersion](https://raw.githubusercontent.com/aquasecurity/trivy/v0.72.0/pkg/scan/utils/utils.go)
and [dpkg parsing](https://raw.githubusercontent.com/aquasecurity/trivy/v0.72.0/pkg/fanal/analyzer/pkg/dpkg/dpkg.go).
The inventory splits epoch, upstream version and revision, while findings use
their assembled identity. A split-version regression failed before correction;
the explicit bounded reconstruction then passed. It is not a semantic/lexical
version comparator, a patch-status override or normalization of a mismatching ID.

Twelve new focused tests cover exact artifact refusal, public-only fields,
duplicate/count preservation, stale DB, unreviewed shapes, split source/binary
versions, strict epochs, inert CLI, private branded errors and physical temp
cleanup. The 34-entry strict operator program passed separately; an earlier
30-second diagnostic compiler timeout remains incomplete, not a changed gate.
Routine checks add only the zero-action plan (80 ordered steps); they never
start Docker, download a DB or inspect a live account.

## Cleanup and next decision

Only existing Desktop/scanner/retained candidate were used. Stopped-only socket
recovery preserved two zero-byte transient directories as recoverable siblings,
scope `fabb3bc13a7849cb81fe3c676b83cc09`; original source helper hash unchanged.
No factory reset, WSL/image/volume deletion, global setting or security weakening.
The owned scanner/archive/cache were removed and absence checked; independent
running-container output was empty, then normal Desktop stop completed.

Keep all 31 findings for an explicit later applicability/base-refresh decision.
Do not rerun an unchanged build, replace a failed result, claim complete legal
coverage or promote this local tag. New request-boundary source changes need a
separate future current-image build/scan/review before any deployment. Original
Maintenance 28/31, provider display rights, browser authorization/hosting and
publication gates are unchanged. [Resumed input boundary](LOCAL_JSON_AND_BROWSER_BOUNDARIES_2026-10-16_RESUME.md).
