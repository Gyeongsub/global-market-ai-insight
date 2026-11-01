import { PATCH } from "../../worker-patch-identity.js";
import { ACCOUNT, REPOSITORY, NOW, manifestResponse, scan } from "./live-image-fixture.js";

// Public content-addressed descriptors only; no registry owner, layer contents, URLs or annotations.
// Exact formatting is part of the immutable digest and is independently verified by tests.
const layers: [string, number][] = [
  ["2cc7ee286bf3a9e6af5f71756d7fc8e22e23ce65fec9047d774511ffcef79fa8",124525],
  ["c172f21841dff4c8cf45cde46589c1c2616cefe7e819965e92e6d3475c428aa0",12675],
  ["218cf840d0d95a86231eb9d33d26ac8a520a4299c6096cb70a0c2fb2a87c9e0a",288057],
  ["f6069939f718601b38d25ec5ed5631ed047e4da24acec2e252f8f29d251be718",254668],
  ["d6b1b89eccacc15c2420b2776d72c1dae334a00805ed9af54bf2f71e4d536f28",32093],
  ["2780920e5dbfbe103d03a583ed75345306e572ec5a48cb10361f046767d9f29a",67],
  ["7c12895b777bcaa8ccae0605b4de635b68fc32d60fa08f421dc3818bf55ee212",188],
  ["3214acf345c0cc6bbdb56b698a41ccdefc624a09d6beb0d38b5de0b2303ecaf4",123],
  ["52630fc75a18675c530ed9eba5f55eca09b03e91bd5bc15307918bbc1a7e7296",162],
  ["dd64bf2dd177757451a98fcdc999a339c35dee5d9872d8f4dc69c8f3c4dd0112",80],
  ["b839dfae01f66e15c6a8b63520557ed315bdfe036342fa7a0c537259f10d7a9a",351],
  ["ebddc55facdc6b1f7e0f30816a5fc7cc62f38abdf76c0a8b0a0ce52085754795",311],
  ["c4bc6f35ff5e25aa1afe7a148a0b6f10a760f54e298f86a4a4d44b91f1afbfab",143338],
  ["b96fe2995f90d0ef0bf14f9b4a67b5f4e77d478e6108166e0565adc9efd6e4a3",5079079],
  ["810e2b405a0884835290e120ef380aa14dd1f53198a0cfa2260147e736d82cd5",3079177],
  ["bd8962e292918c50c90edebd9684c053bc386b9c5503acd8fec75d0c6f93a0b7",372772],
  ["cac2ae0193cb073e7492050b05fc342a888651b4bbc966908c8793f889c299ba",96148],
  ["dd0d9bfd3bee080ad25a464362ec4f37ec5ca625695a4d7179fe69d207dc068d",158447],
  ["7cc70dfd88cf2327bb827123c9156f7cb95de95b2f98f3a7a931296aacec5786",901291],
  ["8224d91da70b7992430d3b04040ea38ecdef4a7b719bee38397c89aaa886e198",84214],
  ["1a4be5562d92d659f95e0b44b245ea5208bf5317481b9a351b07fad7fe5265ec",51535],
  ["7255d342dc6c559165d8b6b21ec572b476d8e68ff47814aa5843ef5323e51929",43929705],
  ["c535d4ce08922072ed406f4af08bc4587db2afb1c99f4e55055e3e10b6deb6c8",98],
  ["555060a749fdca289ada505875685241b67ac9777e97fffc705f66109d4fcf02",272219],
];
export const DATED_PATCH_MANIFEST = JSON.stringify({ schemaVersion: 2, mediaType: "application/vnd.oci.image.manifest.v1+json",
  config: { mediaType: "application/vnd.oci.image.config.v1+json", digest: PATCH.configDigest, size: 4895 },
  layers: layers.map(([digest,size]) => ({ mediaType: "application/vnd.oci.image.layer.v1.tar+gzip", digest: `sha256:${digest}`, size })),
}, null, 2);
export function datedPatchResponses(stale = false) {
  const findings = scan(); findings.imageId.imageDigest = PATCH.runtimeDigest;
  if (stale) {
    findings.imageScanFindings.imageScanCompletedAt = new Date(NOW - 35 * 86_400_000).toISOString();
    findings.imageScanFindings.vulnerabilitySourceUpdatedAt = findings.imageScanFindings.imageScanCompletedAt;
  }
  return [{ imageDetails: [{ registryId: ACCOUNT, repositoryName: REPOSITORY, imageDigest: PATCH.runtimeDigest,
    imageManifestMediaType: "application/vnd.oci.image.manifest.v1+json", imageTags: [PATCH.remoteTag], imageSizeInBytes: 55_000_000 }] },
    manifestResponse(DATED_PATCH_MANIFEST), findings];
}
