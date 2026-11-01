import assert from "node:assert/strict";
import {createHash, X509Certificate} from "node:crypto";
import {rootCertificates} from "node:tls";
import test from "node:test";
import {BLOCKED_CA_FINGERPRINTS, summarizeCaBundle, workerCaTrustProgram} from "../worker-ca-trust.mjs";

// Public, compromised root certificate, not a private key or a new trust anchor.
const blockedDer="MIICTjCCAdOgAwIBAgIKPPYHqWhwDtqLhDAKBggqhkjOPQQDAzBrMQswCQYDVQQGEwJJTjETMBEGA1UECxMKZW1TaWduIFBLSTElMCMGA1UEChMcZU11ZGhyYSBUZWNobm9sb2dpZXMgTGltaXRlZDEgMB4GA1UEAxMXZW1TaWduIEVDQyBSb290IENBIC0gRzMwHhcNMTgwMjE4MTgzMDAwWhcNNDMwMjE4MTgzMDAwWjBrMQswCQYDVQQGEwJJTjETMBEGA1UECxMKZW1TaWduIFBLSTElMCMGA1UEChMcZU11ZGhyYSBUZWNobm9sb2dpZXMgTGltaXRlZDEgMB4GA1UEAxMXZW1TaWduIEVDQyBSb290IENBIC0gRzMwdjAQBgcqhkjOPQIBBgUrgQQAIgNiAAQjpQy4LRL1KPOxst3iAhKAnjlfSU2fySU0WXTsuwYc58Byr+iuL+FBVIcUqEqy6HyC5ltqtdyzdc6LBtCGI79G1Y4PPwT01xySfvalY8L1X44uT6EYGQIrMgqCZH0Wk9GjQjBAMB0GA1UdDgQWBBR8XQKEE9TMipuBzhccLikenEhjQjAOBgNVHQ8BAf8EBAMCAQYwDwYDVR0TAQH/BAUwAwEB/zAKBggqhkjOPQQDAwNpADBmAjEAvvNhzwIQHWSVB7gYboiFBS+DCBeQyh+KTOgNG3qxrdWBCUfvO6wIBHxcmbHtRwfSAjEAnbpV/KlK6O3t5nYBQnvI+GDZjVGLVTv7jHvrZQnD+JbNR6iC8hZVdyR+EhCVBCyj";
const blocked=new X509Certificate(Buffer.from(blockedDer,"base64")).toString();
const unaffected=rootCertificates.find(p=>!BLOCKED_CA_FINGERPRINTS.includes(new X509Certificate(p).fingerprint256.replaceAll(":","").toLowerCase()));

test("CA observations retain compromised-root matches without inventing remediation or raw certificate output",()=>{
  const b=Buffer.from(blocked),p=summarizeCaBundle(b);
  assert.equal(p.bytes,b.length);assert.equal(p.sha256,createHash("sha256").update(b).digest("hex"));
  assert.equal(p.certificates,1);assert.equal(p.blockedRootMatches,1);
  assert.equal(p.certificateBodiesRetained,false);assert.equal(p.activeNodeTrustVerified,false);
  assert.equal(JSON.stringify(p).includes("CERTIFICATE"),false);
  assert.equal(summarizeCaBundle(Buffer.from(unaffected)).blockedRootMatches,0);
  assert.equal(Object.isFrozen(BLOCKED_CA_FINGERPRINTS),true);
});

test("empty, ambiguous, duplicate, malformed, excessive and trailing CA content fails closed",()=>{
  const leaf=Buffer.from(blockedDer,"base64"),constraint=Buffer.from("040530030101ff","hex"),at=leaf.indexOf(constraint);
  assert.ok(at>0);leaf[at+constraint.length-1]=0;
  assert.equal(new X509Certificate(leaf).ca,false);
  for(const b of [Buffer.alloc(0),Buffer.from("PRIVATE_REASON"),Buffer.from(blocked+blocked),Buffer.from(blocked+"PRIVATE_REASON"),
    Buffer.from("-----BEGIN CERTIFICATE-----\nAAAA\n-----END CERTIFICATE-----"),Buffer.alloc(500001),Buffer.from("\xff","latin1"),
    Buffer.from(blocked.repeat(513)),Buffer.from(new X509Certificate(leaf).toString())])
    assert.throws(()=>summarizeCaBundle(b),/^Error: WORKER_CA_TRUST_INCOMPLETE$/);
  assert.throws(()=>summarizeCaBundle(blocked));
});

test("the same fixed probe rejects compromised/default-store/version deviations with synthetic OS ports",async()=>{
  const raw=workerCaTrustProgram(),tlsImport='await import("node:tls")',cryptoImport='await import("node:crypto")';
  assert.equal(raw.split(tlsImport).length,2);assert.equal(raw.split(cryptoImport).length,2);
  // Only the two exact module loads are substituted. No live TLS/network, new
  // trust anchor, host setting or runtime probe bound changes in this unit test.
  const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
  const run=new AsyncFunction("assert","process","syntheticTls","syntheticCrypto",
    raw.replace(tlsImport,"syntheticTls").replace(cryptoImport,"syntheticCrypto")+"return caTrust;");
  const safe=rootCertificates.filter(p=>!BLOCKED_CA_FINGERPRINTS.includes(new X509Certificate(p).fingerprint256.replaceAll(":","").toLowerCase())).slice(0,100);
  assert.equal(safe.length,100);
  const probe=(defaults=safe,bundled=defaults,node="22.23.4")=>run(assert,{versions:{node}},
    {getCACertificates:type=>type==="bundled"?bundled:defaults},{X509Certificate});
  assert.deepEqual(await probe(),{defaultRoots:100,blockedRootFingerprintsAbsent:true,defaultStoreMatchesBundled:true});
  await assert.rejects(()=>probe([...safe.slice(0,99),blocked]));
  await assert.rejects(()=>probe(safe,safe.slice(1)));
  await assert.rejects(()=>probe([]));
  await assert.rejects(()=>probe(Array(513).fill(safe[0])));
  await assert.rejects(()=>probe(safe,safe,"22.23.3"));
});

test("effective-store probe is fixed, inert, bounded and retains the two reviewed public fingerprints",()=>{
  const p=workerCaTrustProgram();assert.ok(p.length<650);
  for(const fp of BLOCKED_CA_FINGERPRINTS)assert.ok(p.includes(fp));
  assert.ok(p.includes('"22.23.4"'));assert.ok(p.includes('getCACertificates("bundled")'));
  assert.doesNotMatch(p,/fetch\(|https:|process\.env|writeFile|rejectUnauthorized/);
});
