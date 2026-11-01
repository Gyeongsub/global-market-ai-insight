import {createHash, X509Certificate} from "node:crypto";

// DSA-6572-1 roots: exact DER SHA-256, independently observed in the old public
// Debian bundle. These are public certificates, never installed on the host.
export const BLOCKED_CA_FINGERPRINTS=Object.freeze([
  "86a1ecba089c4a8d3bbe2734c612ba341d813e043cf9e8a862cd5c57a36bbe6b",
  "d7a7a0fb5d7e2731d771e9484ebcdef71d5f0c3e0a2948782bc83ee0ea699ef4",
]);
const fail=()=>{throw new Error("WORKER_CA_TRUST_INCOMPLETE");};

/** Finite archive observation only: no CA installation, active-store, signature,
 * live handshake, complete revocation or vulnerability-acceptance claim. */
export function summarizeCaBundle(bytes){
  try{
    if(!Buffer.isBuffer(bytes)||bytes.length<1||bytes.length>500000)fail();
    const text=new TextDecoder("utf-8",{fatal:true}).decode(bytes);
    const records=[...text.matchAll(/-----BEGIN CERTIFICATE-----\r?\n[A-Za-z0-9+/=\r\n]+-----END CERTIFICATE-----/g)];
    if(records.length<1||records.length>512||text.replace(/-----BEGIN CERTIFICATE-----\r?\n[A-Za-z0-9+/=\r\n]+-----END CERTIFICATE-----/g,"").trim())fail();
    const seen=new Set();let blockedRootMatches=0;
    for(const [pem] of records){
      const cert=new X509Certificate(pem),fp=createHash("sha256").update(cert.raw).digest("hex");
      if(!cert.ca||seen.has(fp))fail();seen.add(fp);
      if(BLOCKED_CA_FINGERPRINTS.includes(fp))blockedRootMatches++;
    }
    return {bytes:bytes.length,sha256:createHash("sha256").update(bytes).digest("hex"),certificates:records.length,
      blockedRootMatches,certificateBodiesRetained:false,activeNodeTrustVerified:false};
  }catch{return fail();}
}

/** Fixed source appended to the existing no-network/nonroot runtime probe.
 * Checks the effective default store, not merely a package label or CA file. */
export function workerCaTrustProgram(){
  return 'assert.equal(process.versions.node,"22.23.4");const caTls=await import("node:tls"),caX=(await import("node:crypto")).X509Certificate,caRoots=caTls.getCACertificates();'+
    'assert.ok(caRoots.length>=100&&caRoots.length<=512);assert.deepEqual(caRoots,caTls.getCACertificates("bundled"));'+
    'for(const p of caRoots)assert.ok(!'+JSON.stringify(BLOCKED_CA_FINGERPRINTS)+'.includes(new caX(p).fingerprint256.replaceAll(":","").toLowerCase()));'+
    'const caTrust={defaultRoots:caRoots.length,blockedRootFingerprintsAbsent:true,defaultStoreMatchesBundled:true};\n';
}
