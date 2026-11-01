import { createHash } from "node:crypto";

export const ACCOUNT = "123456789012";
export const PREFIX = "global-market-ai-insight-dev";
export const REPOSITORY = `${PREFIX}-worker`;
export const MANIFEST_TYPE = "application/vnd.oci.image.manifest.v1+json";
export const INDEX_TYPE = "application/vnd.oci.image.index.v1+json";
export const hash = (text: string | Buffer) => `sha256:${createHash("sha256").update(text).digest("hex")}`;
export const LAYER_BYTES = Buffer.from("synthetic layer bytes, never executed");
export const LAYER_DIGEST = hash(LAYER_BYTES);
export const CONFIG = JSON.stringify({ architecture: "amd64", os: "linux", config: { User: "65532:65532" }, rootfs: { type: "layers", diff_ids: [LAYER_DIGEST] } });
export const CONFIG_DIGEST = hash(CONFIG);
export const MANIFEST = JSON.stringify({ schemaVersion: 2, mediaType: MANIFEST_TYPE,
  config: { mediaType: "application/vnd.oci.image.config.v1+json", size: Buffer.byteLength(CONFIG), digest: CONFIG_DIGEST },
  layers: [{ mediaType: "application/vnd.oci.image.layer.v1.tar+gzip", size: LAYER_BYTES.length, digest: LAYER_DIGEST }],
});
export const DIGEST = hash(MANIFEST);
export const TASK = `arn:aws:ecs:ap-northeast-1:${ACCOUNT}:task-definition/${REPOSITORY}:9`;
export const NOW = Date.parse("2026-10-04T05:00:00Z");
export const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

export function scan() {
  const time = new Date(NOW - 60_000).toISOString();
  return { registryId: ACCOUNT, repositoryName: REPOSITORY, imageId: { imageDigest: DIGEST },
    imageScanStatus: { status: "COMPLETE", description: "PRIVATE_SENTINEL" },
    imageScanFindings: { imageScanCompletedAt: time, vulnerabilitySourceUpdatedAt: time,
      findingSeverityCounts: { LOW: 1, MEDIUM: 1 }, findings: [
        { severity: "LOW", name: "CVE-2026-0001", description: "PRIVATE_SENTINEL" },
        { severity: "MEDIUM", name: "CVE-2026-0002", description: "PRIVATE_SENTINEL" },
      ] },
  };
}
export function manifestResponse(bytes: string) {
  return { failures: [], images: [{ registryId: ACCOUNT, repositoryName: REPOSITORY, imageId: { imageDigest: hash(bytes) },
    imageManifestMediaType: JSON.parse(bytes).mediaType, imageManifest: bytes }] };
}
export function responses(): unknown[] {
  const resource = (type: string, physical: string, id: string) => ({ ResourceType: type, PhysicalResourceId: physical, LogicalResourceId: id, ResourceStatus: "CREATE_COMPLETE" });
  const controller = { FunctionName: `${PREFIX}-controller`, FunctionArn: `arn:aws:lambda:ap-northeast-1:${ACCOUNT}:function:${PREFIX}-controller`,
    State: "Active", LastUpdateStatus: "Successful", Runtime: "nodejs22.x", Environment: { Variables: {
      ENABLE_PROVIDER_BACKED_JOBS: "false", ENABLE_LIVE_RESULT_DISPLAY: "false", WORKER_TASK_DEFINITION: TASK,
      PRIVATE_TOKEN: "PRIVATE_SENTINEL",
    } } };
  return [
    { Account: ACCOUNT, Arn: `arn:aws:iam::${ACCOUNT}:user/aws-admin-user` },
    { StackResourceSummaries: [resource("AWS::ECR::Repository", REPOSITORY, "WorkerRepository")] },
    { StackResourceSummaries: [resource("AWS::Lambda::Function", `${PREFIX}-controller`, "Controller"), resource("AWS::ECS::TaskDefinition", TASK, "WorkerTask")] },
    controller,
    { taskDefinition: { taskDefinitionArn: TASK, status: "ACTIVE", runtimePlatform: { operatingSystemFamily: "LINUX", cpuArchitecture: "X86_64" }, containerDefinitions: [{ image: `${ACCOUNT}.dkr.ecr.ap-northeast-1.amazonaws.com/${REPOSITORY}@${DIGEST}`, user: "65532:65532", readonlyRootFilesystem: true }] } },
    { repositories: [{ registryId: ACCOUNT, repositoryName: REPOSITORY, repositoryArn: `arn:aws:ecr:ap-northeast-1:${ACCOUNT}:repository/${REPOSITORY}`,
      repositoryUri: `${ACCOUNT}.dkr.ecr.ap-northeast-1.amazonaws.com/${REPOSITORY}`, imageTagMutability: "IMMUTABLE", encryptionConfiguration: { encryptionType: "AES256" } }] },
    { imageDetails: [{ registryId: ACCOUNT, repositoryName: REPOSITORY, imageDigest: DIGEST, imageSizeInBytes: 55_000_000, imageManifestMediaType: MANIFEST_TYPE,
      imageScanFindingsSummary: { findingSeverityCounts: { CRITICAL: 0 } }, imageScanStatus: { status: "COMPLETE" } }] },
    manifestResponse(MANIFEST), scan(), controller,
  ];
}
export function indexedResponses(): unknown[] {
  const input = responses() as any[];
  const index = JSON.stringify({ schemaVersion: 2, mediaType: INDEX_TYPE, manifests: [
    { mediaType: MANIFEST_TYPE, digest: DIGEST, size: Buffer.byteLength(MANIFEST), platform: { os: "linux", architecture: "amd64" } },
    { mediaType: MANIFEST_TYPE, digest: `sha256:${"b".repeat(64)}`, size: 128, platform: { os: "unknown", architecture: "unknown" }, annotations: { "vnd.docker.reference.type": "attestation-manifest" } },
  ] });
  input[4].taskDefinition.containerDefinitions[0].image = input[4].taskDefinition.containerDefinitions[0].image.replace(DIGEST, hash(index));
  const childDetail = clone(input[6]);
  input[6].imageDetails[0].imageDigest = hash(index); input[6].imageDetails[0].imageManifestMediaType = INDEX_TYPE;
  return [...input.slice(0, 7), manifestResponse(index), childDetail, manifestResponse(MANIFEST), input[8], input[9]];
}
