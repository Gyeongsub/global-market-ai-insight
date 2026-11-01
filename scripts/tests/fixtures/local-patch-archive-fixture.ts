import { hash, LAYER_BYTES, LAYER_DIGEST, MANIFEST_TYPE, INDEX_TYPE } from "./live-image-fixture.js";

export function makeTar(entries: { name: string; bytes: Buffer; kind?: string }[]) {
  return Buffer.concat([...entries.flatMap(entry => {
    const header = Buffer.alloc(512); header.write(entry.name, 0, 100);
    header.write(entry.bytes.length.toString(8).padStart(11, "0") + "\0", 124, 12); header.fill(32, 148, 156); header[156] = (entry.kind ?? "0").charCodeAt(0);
    const sum = header.reduce((value, byte) => value + byte, 0); header.write(sum.toString(8).padStart(6, "0") + "\0 ", 148, 8);
    return [header, entry.bytes, Buffer.alloc((512 - entry.bytes.length % 512) % 512)];
  }), Buffer.alloc(1024)]);
}

export function localPatchFixture(indexed = false, mutateConfig: (value: any) => void = () => {}, mutateManifest: (value: any) => void = () => {}) {
  const configValue = { architecture: "amd64", os: "linux", config: { User: "65532:65532", Env: ["NODE_ENV=production"], Entrypoint: ["/nodejs/bin/node", "main.mjs"] },
    rootfs: { type: "layers", diff_ids: [LAYER_DIGEST] } };
  mutateConfig(configValue);
  const config = JSON.stringify(configValue), configDigest = hash(config);
  const manifestValue = { schemaVersion: 2, mediaType: MANIFEST_TYPE, config: { mediaType: "application/vnd.oci.image.config.v1+json", size: Buffer.byteLength(config), digest: configDigest },
    layers: [{ mediaType: "application/vnd.oci.image.layer.v1.tar+gzip", size: LAYER_BYTES.length, digest: LAYER_DIGEST }] };
  mutateManifest(manifestValue);
  const manifest = JSON.stringify(manifestValue), runtimeDigest = hash(manifest);
  const index = JSON.stringify({ schemaVersion: 2, mediaType: INDEX_TYPE, manifests: [{ digest: runtimeDigest, mediaType: MANIFEST_TYPE, size: Buffer.byteLength(manifest), platform: { os: "linux", architecture: "amd64" } }] });
  const id = indexed ? hash(index) : runtimeDigest;
  const entries = [
    { name: `blobs/sha256/${configDigest.slice(7)}`, bytes: Buffer.from(config) },
    { name: `blobs/sha256/${runtimeDigest.slice(7)}`, bytes: Buffer.from(manifest) },
    { name: `blobs/sha256/${LAYER_DIGEST.slice(7)}`, bytes: LAYER_BYTES },
    ...(indexed ? [{ name: `blobs/sha256/${id.slice(7)}`, bytes: Buffer.from(index) }] : []),
    { name: "oci-layout", bytes: Buffer.from(JSON.stringify({ imageLayoutVersion: "1.0.0" })) },
    { name: "index.json", bytes: Buffer.from(JSON.stringify({ schemaVersion: 2, manifests: [{ digest: id }] })) },
    { name: "manifest.json", bytes: Buffer.from(JSON.stringify([{ Config: `blobs/sha256/${configDigest.slice(7)}`, Layers: [`blobs/sha256/${LAYER_DIGEST.slice(7)}`] }])) },
  ];
  const image = [{ Id: id, Os: "linux", Architecture: "amd64", Size: 55_000_000, RepoTags: ["gmai-worker:local-20261004-release"],
    Descriptor: { digest: id, mediaType: indexed ? INDEX_TYPE : MANIFEST_TYPE }, Config: { User: "65532:65532", Entrypoint: ["/nodejs/bin/node", "main.mjs"] } }];
  return { entries, image, runtimeDigest, configDigest, bytes: makeTar(entries) };
}
