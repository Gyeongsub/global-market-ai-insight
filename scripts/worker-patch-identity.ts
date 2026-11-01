// One immutable candidate backed by the dated build/archive evidence, not a
// generic caller-selected registry, image, tag or acceptance override.
export const PATCH = Object.freeze({ localTag: "gmai-worker:local-20261004-release", remoteTag: "patch-20261004-f3d8d7ba40da",
  runtimeDigest: "sha256:f3d8d7ba40da459636954521e539d286eb73c8994a7fd76ebcfe534e3dd69e9a",
  configDigest: "sha256:875c9a8082c09164f3ec7e7d3296d676730fbf86bf2e613c38d2997e43b2cc5c",
  acceptanceTime: "2026-10-04T06:42:00Z" });

export function verifyPromotedImageDetail(value: unknown, account: string) {
  const input: any = value;
  if (!/^[0-9]{12}$/.test(account) || /^0+$/.test(account) || input?.nextToken != null || !Array.isArray(input?.imageDetails) || input.imageDetails.length !== 1) throw new Error("PROMOTION_IMAGE_UNVERIFIED");
  const image = input.imageDetails[0];
  if (image?.registryId !== account || image.repositoryName !== "global-market-ai-insight-dev-worker" || image.imageDigest !== PATCH.runtimeDigest ||
      image.imageManifestMediaType !== "application/vnd.oci.image.manifest.v1+json" || !Array.isArray(image.imageTags) ||
      !image.imageTags.includes(PATCH.remoteTag) || !Number.isSafeInteger(image.imageSizeInBytes) || image.imageSizeInBytes <= 0 || image.imageSizeInBytes > 256 * 1024 * 1024) throw new Error("PROMOTION_IMAGE_UNVERIFIED");
  return image.imageSizeInBytes as number;
}
