import assert from "node:assert/strict";
import {generateKeyPairSync} from "node:crypto";
import {test} from "node:test";
import {validatePrivateViewerPublicKey} from "../lib/private-viewer-key.js";
test("viewer verification accepts only CloudFront RSA2048 or P256 public SPKI keys",()=>{
  for(const pair of [generateKeyPairSync("rsa",{modulusLength:2048}),generateKeyPairSync("ec",{namedCurve:"prime256v1"})]){
    const pem=pair.publicKey.export({type:"spki",format:"pem"}).toString();
    assert.equal(validatePrivateViewerPublicKey(pem),pem);
    assert.equal(validatePrivateViewerPublicKey(pem.replaceAll("\n","\r\n")),pem);
    assert.throws(()=>validatePrivateViewerPublicKey(pair.privateKey.export({type:"pkcs8",format:"pem"}).toString()),/PRIVATE_VIEWER_PUBLIC_KEY_INVALID/);
  }
});
test("invalid, oversized, private, concatenated or unsupported keys fail without reflecting contents",()=>{
  const ec=generateKeyPairSync("ec",{namedCurve:"secp384r1"}).publicKey.export({type:"spki",format:"pem"}).toString();
  const rsa=generateKeyPairSync("rsa",{modulusLength:1024}).publicKey.export({type:"spki",format:"pem"}).toString();
  const ed=generateKeyPairSync("ed25519").publicKey.export({type:"spki",format:"pem"}).toString();
  for(const value of [undefined,null,"",ec,rsa,ed,ec+ec,"PRIVATE_SENTINEL","a".repeat(2049),"-----BEGIN PUBLIC KEY-----\nAAAA\n-----END PUBLIC KEY-----"]){
    assert.throws(()=>validatePrivateViewerPublicKey(value),{message:"PRIVATE_VIEWER_PUBLIC_KEY_INVALID"});
  }
});
