# Disabled Compute patch review — 2026-10-04 evening

## Decision: preparation only, no execution

The afternoon private dated patch was rechecked, not pushed again. Fresh
candidate archive scans matched the immutable registry manifest/config and
all 26 content blobs: 14 OS packages, LOW eight, MEDIUM 23, HIGH/CRITICAL/
UNKNOWN zero and secrets zero. Scanner containers and private archives were
removed. Candidate success does not clear the old deployed HIGH-three image.

Five bounded operator invocations were attempted. The first stopped at the
standard CDK partition-placeholder check before publication. Subsequent
attempts stopped at nested/tag or detail gates. Six total owned change sets
were created and removed; **zero execute-change-set attempts occurred**.
Closing list-change-sets independently found zero owned patch sets and zero
AVAILABLE/EXECUTE_IN_PROGRESS sets. Compute remains UPDATE_COMPLETE with the
old disabled reference; Foundation/API were never deployment targets.

The standard partition placeholder now resolves only to `aws` for the exact
owned Tokyo asset destination. Stack tag comparison is canonical by unique
key, never permission to omit/change tags. The pinned CDK prepare path was
observed to include nested stacks and omit the original stack tag map; its
draft is never executed. A separate explicit non-nested UPDATE retained the
old execution role, tags, BootstrapVersion and reviewed template.

The final actual details included a dynamic direct Environment entry plus
the known task reference, and a static direct PolicyDocument entry rather
than the expected resource-reference detail. **These were not accepted by
loosening the policy gate.** Exact template properties were unchanged except
controller Code and worker ContainerDefinitions, but resolved IAM before/
after values still need independent review of the precise task ARN scope.
Enum-only diagnostics exclude private property values and arbitrary causes.

AWS documents recreation fields only for Properties. Omitted/null Metadata
recreation is now narrowly supported while resource replacement, metadata
scope and unchanged properties stay independently gated; this was not the
final blocker. [Official field definition](https://docs.aws.amazon.com/AWSCloudFormation/latest/APIReference/API_ResourceTargetDefinition.html).

## Local proof and boundaries

The evening full native gate passed 643 tests: 642 passed, one Windows
file-symlink privilege skip. After the final diagnostic/Metadata additions,
all 16 focused rollout tests passed. A repeat isolated pnpm 11.16.0 install
did not complete its 180-second install bound: FRESH_INSTALL_INSTALL_INCOMPLETE.
It is **not** fresh-install success for the later source. The owned tree was
removed and independently absent; original installation/lockfile unchanged,
lifecycle hooks/cloud credentials disabled. Earlier afternoon proofs remain
limited to their named snapshots.

The final repeated native gate passed 645 tests: 644 passed/one OS skip,
plus build/type/lint/synth/secret/local HTTP checks. Closing evidence documents
were added afterward and checked separately for links/privacy, not silently
claimed as part of the earlier isolated install snapshot.

The new independent controller ZIP/source-binding operator is default-zero,
with five local tests, but its live path was **not run** because rollout did
not occur. No worker/provider/Bedrock/API job, GitHub/public site/data, new ECR
image, subscription, schedule or always-on resource was started this evening.

CDK published/reused at most three existing-bootstrap file assets, six source
files and 1,625,689 source bytes before compression. Private bootstrap assets
were retained, not deleted blindly as temporary files. Storage/versioning and
request costs remain possible; exact incremental billed storage was not
measured. See [release boundaries](../COMPUTE_PATCH_RELEASE.md) and
[closing verification](LOCAL_SAFE_STOP_2026-10-04_EVENING.md).

Next: review resolved policy/task-reference before/after scope from a new
bounded owned change set, then only if fully justified execute one disabled
Compute update. Independent default live-archive and controller ZIP proofs,
Stage C, licensing/privacy, clone/CI and public hosting remain separate gates.
