export const PUBLIC_BASE_DIGEST: string;
export const REVIEWED_WORKER_DOCKERFILE_SHA256: string;
export interface PublicBaseBinding {
  manifestDigest: string;
  manifestBytes: number;
  configDigest: string;
  configBytes: number;
  platform: "linux/amd64";
  nonrootBaseUser: "65532";
  layers: Array<{ digest: string; mediaType: string; size: number; diffId: string }>;
}
export function verifyPublicBaseMetadata(manifestBytes: Buffer, configBytes: Buffer, expectedDigest?: string): PublicBaseBinding;
