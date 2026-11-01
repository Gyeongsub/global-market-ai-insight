# Worker CA and Node security refresh — 2026-10-22 Tokyo

Local-only security remediation, not a cloud rollout or publication approval.
No AWS resource/IAM mutation, provider/model job, push, hosting or subscription.
The [October 21 blocked image](WORKER_CA_ADVISORY_2026-10-21.md) stays historical;
its UNKNOWN finding was not suppressed, reclassified or accepted by exception.

## Reviewed upstream changes

The [Debian tracker](https://security-tracker.debian.org/tracker/DSA-6572-1)
and [announcement](https://lists.debian.org/debian-security-announce/2026/msg00487.html)
were refreshed today. The fixed CA version is `20250419+deb13u1`.
[Node 22.23.4](https://nodejs.org/en/blog/release/v22.23.4/) is the October 21
security release, including updated root material and TLS/public-key defenses.
Changing only a package label or seeing scanner status `fixed` is insufficient.

The new public linux/amd64 distroless manifest is
`sha256:eed5cbf9fcdb7f97de1fb39adde1972efa57df1085c0c76a5ea17c7c27ff8f6c`,
config `sha256:914858645274036e2349a5a2f9c7e4e459be1a36fa17f6bc4c081d2e244b8c80`.
It retains the bare Node entrypoint, unlike yesterday's unadopted experiment.
Both Dockerfile stages are fixed to reviewed linux/amd64 digests; the official
build-stage Node 22.23.4 manifest is
`sha256:ea11b74b986d520137cdef9a5346e447a00f275ecc4abc0055b7151226231e09`.
Current Dockerfile SHA-256:
`7b82dbe84cc1c26a8c7807512aaa463ecd420fce517d58c12dad9084b0bee022`.

At **10:22:55.609 UTC**, the fixed public collector verified all 22 layer hashes
and diff-IDs in memory: 38 anonymous requests/54,663,034 bytes. No extraction,
image execution, private credentials or project metadata transmission. Fourteen
OS package declarations include the fixed CA version. Node binary SHA-256 is
`94efd062ed066c1a0b332e18249859c905e920eeada5df55d24c99b919629a90`.
This digest binding is **not** publisher-signature or complete legal clearance.

## OS bundle and effective Node trust are separate

The former public CA bundle contains 150 certificates/224,449 bytes, SHA-256
`714d457d580922dbf1d0be8bd35ba236a842b50b0072ae791582a19adef772a5`.
Two public DER fingerprints independently identify the removed roots:

- emSign ECC Root CA - G3: `86a1ecba089c4a8d3bbe2734c612ba341d813e043cf9e8a862cd5c57a36bbe6b`
- AAA Certificate Services: `d7a7a0fb5d7e2731d771e9484ebcdef71d5f0c3e0a2948782bc83ee0ea699ef4`

The fixed OS bundle contains 148 certificates/222,073 bytes, SHA-256
`e9c7b63ee2623386e9b0a3ee32f499d01a8ea23dc83b8383ddff9f8e749543b7`,
with neither root. The existing bounded tar/overlay parser is reused; regular
CA contents remain memory-only and only finite counts/hashes are returned.
Duplicates, malformed certificates, trailing content, oversize and non-CA data
fail closed. Links are not followed; absent/removed bundle means unknown/null.

The runtime probe separately reads Node's **effective default** store, compares
it with the bundled store and checks both fingerprints. Actual Linux Node
22.23.4 reported **116 default roots**, not the OS bundle's 148. Schema 5 requires
the exact patched runtime and finite trust result; old schema-4/22.23.3 receipts
cannot clear it. The complete program is 19,990 characters, below the unchanged
20,000 ceiling. All original 45 lifecycle/18 entrypoint/three process probes,
isolation and time/size limits remain. No live TLS handshake or universal
certificate/revocation guarantee is claimed.

## First actual image snapshot

Owned session `a95f50bd-da5e-403b-bd94-2eaffc28e53e` completed
**10:27:45.745 UTC**, passed, normal Docker stop and owned configuration removal.
Build receipt `adb1c95d-5893-41fe-af53-38951dcfab00`; runtime receipt
`fe22ccb3-2b39-44ed-8e5a-3cfa72292d42`. Independent strict reread matched all
three to **583 files/5,746,338 bytes**, SHA-256
`7c67ffc3a4ede3ef53ec4ae1ff80c1fd8a596c87a7188819ecb0bce2d8ff57c7`.
Image `sha256:20666c8cbc57542b40857b51cf471b8208d42503c74885964e4b6a3dfe2bcddb`,
config `sha256:077e75e3f9cd23f62d243b9f31eb4f1abe879e3c662bd3a6c66c96e3629722fd`.
The application itself is unchanged: 1,492,833 bytes, SHA-256
`f59047dae4177cde1de7be5d9c0652716b0d7d84364865850bfabd3e75421c34`.

Fresh scan: **UNKNOWN 0/HIGH 0/CRITICAL 0/secrets 0; MEDIUM 23/LOW 8**.
All 31 remaining OS occurrences, their source/binary coordinates and absence
of advertised fixes remain recorded. No ignore/VEX, risk waiver or severity
filter. This is not full native/generated-source or legal acceptance.
Later operator guards/docs are outside this first source snapshot; final
current-scope image and frozen-install evidence must be recorded separately.

## Verification-tool runtime boundary

The managed Windows runtime was 24.19.0. It is not silently updated or treated
as meeting the [Node 24.22.1 security release](https://nodejs.org/en/blog/release/v24.22.1/).
An ignored task-owned portable executable was downloaded from the official
fixed Windows x64 URL, matched its published SHA-256
`d702daa815eabbff763c7d3808e235cf031cf2ca70211b56847bc72f51e240e5`
(93,915,464 bytes), and passed Windows Authenticode/expected OpenJS publisher
verification before execution. No system install, PATH, trust, execution policy
or Codex installation change; task-owned binary removal is required at closure.
The release-page PGP signature was not independently verified.

Selected real public-base/frozen-install/image-build/runtime/owned-Desktop
operators now reject unsupported runtimes before their effects: Node 22 must be
at least 22.23.4; Node 24 at least 24.22.1. Imports/default dry plans remain inert.
The version guard is not binary authentication, a sandbox, automatic updating
or an audit of every project tool. A synthetic old-runtime reproduction now
stubs both filesystem creation and fetch; it performs no external request.
The initial unguarded reproduction timed out; it is not a passing negative
test. Subsequent inventory confirmed no owned temporary-directory residue.

## Independent release gates

Final Vite/notice-source session `af7405a7-506c-47ec-8c0e-e4fb18cb63b3`
completed **11:10:38.632 UTC**, normally stopping Docker. Build
`8ac8ff34-8927-49a7-8867-89dc55f11214` and runtime
`23208872-6d58-4886-9a01-290498bb36bd` were independently strict-validated
against **588 files/5,774,803 bytes**, SHA-256
`750b3fd5be75adf620c315e640d7875cbcfef0b7617015b79483c4d5b873099b`.
Image `sha256:2453862580408b015e68439782806ecc5f86fae982d5a8fa58ba78884e1a9bd9`;
config `sha256:9394a7f205da45ab151931f86d03606c78bf3d5d8d375f46061a0a4c9b0ee246`.
Updated notices explain the image change; application module SHA and all
116-root/45+18+3 results and vulnerability counts are unchanged. Later exact
notice-version test fixes and handoff documents are outside that fingerprint.
[Final failed whole gate and separate successful checks](LOCAL_SAFE_STOP_2026-10-22.md).

The later patched-host run `8a748f4a-d1c1-4cf6-a227-315c62899624` completed
**10:42:38.929 UTC** with normal stop. Build `019fffe0-ef76-4606-8521-09cda948a71d`
and runtime `34521cf4-b5f7-411d-b143-184d59f490e0` independently matched
**587 files/5,761,471 bytes**, SHA-256
`f6bd202dc593cee68f02b464b919ecff3768cedd435224b8c76caa298885debc`, before this
closing text and subsequent synthetic-test strengthening. The image/config/
application identities, scan counts and 116-root/45+18+3 acceptance are unchanged.
No repeated unchanged-scope attempt was needed: the second run covered the new
operator baseline under the independently verified portable Node. Test-only and
final text changes are separately covered by the final frozen/static checks.

Keep real jobs/display disabled and circuit OPEN. Do not reuse old image/scan/
runtime receipts for a rollout. Maintenance 28/31 and actual recovery/notification,
provider rights, end-user authentication/abuse, hosting TLS/billing, signatures/
native/licenses, clean clone/CI and final privacy/history review remain open.
No public repository, workflow or upload is authorized by this local repair.
