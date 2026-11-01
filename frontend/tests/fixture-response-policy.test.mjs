import assert from "node:assert/strict";
import test from "node:test";
import {fileURLToPath} from "node:url";
import {loadConfigFromFile} from "vite";
import {FIXTURE_CSP,FIXTURE_PERMISSIONS_POLICY,FIXTURE_PREVIEW_HEADERS} from "../../shared/fixture-response-policy.mjs";

test("production preview enforces fixture connection/script/frame/privacy policy without applying it to HMR development",async()=>{
  const loaded=await loadConfigFromFile({command:"serve",mode:"production",isPreview:true},
    fileURLToPath(new URL("../vite.config.ts",import.meta.url)),undefined,"silent");
  assert.ok(loaded);const preview=loaded.config.preview,headers=preview?.headers??{};
  assert.deepEqual(headers,FIXTURE_PREVIEW_HEADERS);
  assert.equal(preview.host,"127.0.0.1");assert.equal(preview.port,4173);assert.equal(preview.strictPort,true);
  assert.equal(loaded.config.server.host,"127.0.0.1");assert.equal(loaded.config.server.port,5173);
  assert.equal(loaded.config.server.strictPort,true);assert.equal(loaded.config.server.forwardConsole,false);
  assert.match(headers["Content-Security-Policy"]??"",/connect-src 'none'/);
  assert.match(headers["Content-Security-Policy"]??"",/script-src 'self';/);
  assert.doesNotMatch(headers["Content-Security-Policy"]??"",/unsafe-eval|script-src[^;]*unsafe-inline|https:/);
  assert.equal(headers["X-Content-Type-Options"],"nosniff");assert.equal(headers["X-Frame-Options"],"DENY");
  assert.equal(headers["Referrer-Policy"],"no-referrer");
  assert.equal(headers["Permissions-Policy"],"camera=(), microphone=(), geolocation=()");
  assert.equal(headers["Strict-Transport-Security"],undefined,"Loopback HTTP is not a remote HTTPS/TLS acceptance.");
  assert.equal(loaded.config.server?.headers?.["Content-Security-Policy"],undefined,"HMR development stays a separate mode.");
});

test("fixture security constants are frozen, finite, credential-free and never authorize a live endpoint",()=>{
  assert.equal(Object.isFrozen(FIXTURE_PREVIEW_HEADERS),true);
  assert.equal(FIXTURE_PREVIEW_HEADERS["Content-Security-Policy"],FIXTURE_CSP);
  assert.equal(FIXTURE_PREVIEW_HEADERS["Permissions-Policy"],FIXTURE_PERMISSIONS_POLICY);
  assert.deepEqual(Object.keys(FIXTURE_PREVIEW_HEADERS).sort(),["Content-Security-Policy","Permissions-Policy","Referrer-Policy","X-Content-Type-Options","X-Frame-Options"]);
  assert.throws(()=>{FIXTURE_PREVIEW_HEADERS["Content-Security-Policy"]="connect-src *";},TypeError);
  assert.doesNotMatch(JSON.stringify(FIXTURE_PREVIEW_HEADERS),/Authorization|Access-Control-Allow|https?:|wss?:|unsafe-eval/);
});
