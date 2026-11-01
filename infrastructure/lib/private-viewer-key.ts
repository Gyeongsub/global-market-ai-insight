import {createPublicKey} from "node:crypto";

/** Accept a public SPKI PEM only. createPublicKey also accepts private keys, so
 * the envelope check must precede crypto parsing. No secret-reading fallback. */
export function validatePrivateViewerPublicKey(value:unknown):string {
  const fail=():never=>{throw Error("PRIVATE_VIEWER_PUBLIC_KEY_INVALID");};
  if(typeof value!=="string"||value.length>2048||
    !/^-----BEGIN PUBLIC KEY-----\r?\n[A-Za-z0-9+/=\r\n]+\r?\n-----END PUBLIC KEY-----\r?\n?$/.test(value))fail();
  try{
    const key=createPublicKey(value as string),details=key.asymmetricKeyDetails;
    if(key.type!=="public"||!(key.asymmetricKeyType==="rsa"&&details?.modulusLength===2048&&details.publicExponent===65537n||
      key.asymmetricKeyType==="ec"&&details?.namedCurve==="prime256v1"))fail();
    return key.export({type:"spki",format:"pem"}).toString();
  }catch{return fail();}
}
