import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { lstatSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";

const ACTION = "logs:PutLogEvents";
const RESOURCE = "arn:aws:logs:ap-northeast-1:123456789012:log-group:/aws/lambda/synthetic-cli-proof:log-stream:2026/10/14/[$LATEST]" + "a".repeat(32);
const POLICY = JSON.stringify({ Version: "2012-10-17", Statement: [{ Effect: "Allow", Action: ACTION, Resource: RESOURCE }] });
const KEYS = ["Action", "ActionNames.member.1", "PolicyInputList.member.1", "ResourceArns.member.1", "Version"];
const fail = () => { throw new Error("LOCAL_IAM_WIRE_PROOF_INCOMPLETE"); };
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
class LocalWireFailure extends Error {
  constructor(facts) { super("LOCAL_IAM_WIRE_PROOF_INCOMPLETE"); this.facts = facts; }
}

export function localIamWirePlan(args = []) {
  if (args.length) fail();
  return { mode: "dry-run", awsCalls: 0, externalNetworkCalls: 0, subprocessesStarted: 0, filesWritten: 0,
    loopbackRequestsMax: 2, cliInvocationsMax: 3, deadlineMs: 30000, unsignedSyntheticRequestsOnly: true,
    actualAwsRequestVerified: false, liveAuthorizationVerified: false, permissionsGateUnchanged: true,
    credentialRefreshPerformed: false, policyAttached: false, readyForDeployment: false };
}

/** Discover the known per-user vendor installation without publishing a
 * personal computer path. Default/import performs no discovery or file read. */
export function localIamWireCliPath(source) {
  const base = source?.LOCALAPPDATA;
  if (typeof base !== "string" || base.length < 1 || base.length > 4096 || base.includes("\0") ||
      !isAbsolute(base) || base.startsWith("\\\\") || base.startsWith("//")) fail();
  return resolve(base, "Programs", "Amazon", "AWSCLIV2", "aws.exe");
}

export function localIamWireArguments(endpoint, mode) {
  if (typeof endpoint !== "string" || !/^http:\/\/127\.0\.0\.1:[1-9][0-9]{0,4}$/.test(endpoint) ||
      Number(new URL(endpoint).port) > 65535 || !["argv", "cli-input-json"].includes(mode)) fail();
  const common = ["iam", "simulate-custom-policy", "--endpoint-url", endpoint, "--no-sign-request",
    "--region", "ap-northeast-1", "--no-cli-pager", "--no-paginate", "--output", "json", "--cli-connect-timeout", "2", "--cli-read-timeout", "3"];
  return mode === "argv" ? [...common, "--policy-input-list", POLICY, "--action-names", ACTION, "--resource-arns", RESOURCE] :
    [...common, "--cli-input-json", JSON.stringify({ PolicyInputList: [POLICY], ActionNames: [ACTION], ResourceArns: [RESOURCE] })];
}

/** Exact synthetic IAM Query protocol only; never return received data. */
export function verifyLocalIamWireRequest(method, headers, body) {
  if (method !== "POST" || !headers || typeof headers !== "object" || Array.isArray(headers) ||
      typeof body !== "string" || Buffer.byteLength(body) < 1 || Buffer.byteLength(body) > 8192) fail();
  const normalized = Object.fromEntries(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]));
  if (["authorization", "x-amz-security-token", "cookie", "proxy-authorization"].some(key => Object.hasOwn(normalized, key)) ||
      typeof normalized["content-type"] !== "string" || !/^application\/x-www-form-urlencoded(?:;.*)?$/i.test(normalized["content-type"])) fail();
  const params = new URLSearchParams(body), keys = [...params.keys()].sort();
  if (JSON.stringify(keys) !== JSON.stringify(KEYS) || params.get("Action") !== "SimulateCustomPolicy" ||
      params.get("Version") !== "2010-05-08" || params.get("PolicyInputList.member.1") !== POLICY ||
      params.get("ActionNames.member.1") !== ACTION || params.get("ResourceArns.member.1") !== RESOURCE) fail();
  return { exactQueryMatched: true, unsigned: true, syntheticScopeOnly: true,
    normalizedRequestSha256: hash(JSON.stringify(KEYS.map(key => [key, params.get(key)]))), rawInputSuppressed: true };
}

/** Allowlisted OS bootstrap only; unknown credentials/proxies/options do not
 * reach the CLI. Its credential/config files are EMPTY disposable fixtures. */
export function localIamWireEnvironment(source, root) {
  if (!source || typeof source !== "object" || typeof root !== "string" || !root || root.includes("\0")) fail();
  const allowed = new Set(["PATH", "PATHEXT", "SYSTEMROOT", "WINDIR", "COMSPEC", "LOCALAPPDATA", "APPDATA",
    "USERPROFILE", "HOME", "LANG", "LC_ALL", "NUMBER_OF_PROCESSORS", "PROCESSOR_ARCHITECTURE", "OS"]);
  const env = {};
  for (const [key, value] of Object.entries(source)) if (allowed.has(key.toUpperCase()) && typeof value === "string") env[key] = value;
  return { ...env, TEMP: root, TMP: root, HOME: root, USERPROFILE: root, APPDATA: root, LOCALAPPDATA: root,
    AWS_CONFIG_FILE: join(root, "config"), AWS_SHARED_CREDENTIALS_FILE: join(root, "credentials"),
    AWS_EC2_METADATA_DISABLED: "true", AWS_MAX_ATTEMPTS: "1", AWS_PAGER: "", AWS_CLI_AUTO_PROMPT: "off",
    AWS_IGNORE_CONFIGURED_ENDPOINT_URLS: "true", AWS_CSM_ENABLED: "false", NO_PROXY: "127.0.0.1,localhost" };
}

export function safeLocalIamWireTemporary(base, directory, physicalBase, marker) {
  try {
    if (typeof marker !== "string" || Buffer.byteLength(marker) < 1 || Buffer.byteLength(marker) > 1000) return false;
    return resolve(base) === dirname(resolve(directory)) && /^gmai-cli-wire-proof-[A-Za-z0-9]+$/.test(basename(directory)) &&
      realpathSync(base) === physicalBase && lstatSync(directory).isDirectory() && !lstatSync(directory).isSymbolicLink() &&
      realpathSync(directory) === join(physicalBase, basename(directory)) &&
      lstatSync(join(directory, "scope.json")).isFile() && !lstatSync(join(directory, "scope.json")).isSymbolicLink() &&
      lstatSync(join(directory, "scope.json")).size === Buffer.byteLength(marker) &&
      realpathSync(join(directory, "scope.json")) === join(physicalBase, basename(directory), "scope.json") &&
      readFileSync(join(directory, "scope.json"), "utf8") === marker;
  } catch { return false; }
}

function runCli(cli, args, env, timeoutMs) {
  return new Promise(resolveResult => {
    const child = spawn(cli, args, { env, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    let failed = false, size = 0; const stdout = [];
    const timer = setTimeout(() => { failed = true; child.kill("SIGKILL"); }, timeoutMs);
    child.on("error", () => { failed = true; });
    for (const [stream, collect] of [[child.stdout, true], [child.stderr, false]]) stream.on("data", chunk => {
      size += chunk.length;
      if (size > 65536) { failed = true; child.kill("SIGKILL"); }
      else if (collect) stdout.push(chunk);
    });
    child.on("close", (code, signal) => { clearTimeout(timer); resolveResult({ code, signal, failed,
      stdout: failed ? "" : Buffer.concat(stdout).toString("utf8"), childClosed: true }); });
  });
}

function syntheticResponse() {
  return `<?xml version="1.0" encoding="UTF-8"?><SimulateCustomPolicyResponse xmlns="https://iam.amazonaws.com/doc/2010-05-08/">` +
    `<SimulateCustomPolicyResult><EvaluationResults><member><EvalActionName>${ACTION}</EvalActionName><EvalResourceName>${RESOURCE}</EvalResourceName>` +
    `<EvalDecision>allowed</EvalDecision><MatchedStatements/><MissingContextValues/></member></EvaluationResults><IsTruncated>false</IsTruncated>` +
    `</SimulateCustomPolicyResult><ResponseMetadata><RequestId>synthetic-local-only</RequestId></ResponseMetadata></SimulateCustomPolicyResponse>`;
}

export async function executeLocalIamWireProof() {
  if (process.platform !== "win32") fail();
  const cli = localIamWireCliPath(process.env);
  if (!lstatSync(cli).isFile() || lstatSync(cli).isSymbolicLink() || realpathSync(cli) !== cli) fail();
  const started = performance.now(), base = resolve(tmpdir()), physicalBase = realpathSync(base);
  const directory = mkdtempSync(join(base, "gmai-cli-wire-proof-"));
  if (lstatSync(directory).isSymbolicLink() || realpathSync(directory) !== join(physicalBase, basename(directory))) fail();
  const marker = JSON.stringify({ purpose: "unsigned-local-iam-cli-wire-proof", runId: randomUUID() }) + "\n";
  let requests = 0, requestFailure = false, serverClosed = false, temporaryTreeRetained = true, cliClosed = 0;
  let phase = "setup", failed = false, protocol = "unobserved", lastCliExit = null;
  const records = [], server = createServer((request, response) => {
    requests++; const chunks = []; let size = 0, refused = false;
    const contentType = request.headers["content-type"];
    protocol = typeof contentType === "string" && contentType.startsWith("application/x-www-form-urlencoded") ? "iam-query" :
      typeof contentType === "string" && contentType.startsWith("application/x-amz-json-") ? "aws-json" : "other";
    const reject = () => { requestFailure = true; if (refused) return; refused = true;
      response.writeHead(400); response.end("Synthetic fixture refused input."); };
    if (requests > 2 || request.socket.remoteAddress !== "127.0.0.1") { reject(); return; }
    request.on("error", () => { requestFailure = true; });
    request.on("data", chunk => { size += chunk.length; if (size > 8192) { reject(); request.destroy(); } else chunks.push(chunk); });
    request.on("end", () => {
      if (refused) return;
      try { records.push(verifyLocalIamWireRequest(request.method, request.headers,
        new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)))); }
      catch { reject(); return; }
      response.writeHead(200, { "content-type": "text/xml; charset=utf-8", "connection": "close" }); response.end(syntheticResponse());
    });
  });
  server.requestTimeout = 4000; server.headersTimeout = 4000; server.keepAliveTimeout = 1000;
  let proof;
  try {
    writeFileSync(join(directory, "scope.json"), marker, { flag: "wx" });
    writeFileSync(join(directory, "config"), "", { flag: "wx" }); writeFileSync(join(directory, "credentials"), "", { flag: "wx" });
    phase = "listen";
    await new Promise((done, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", done); });
    const address = server.address();
    if (!address || typeof address === "string" || address.address !== "127.0.0.1" || address.family !== "IPv4") fail();
    const env = localIamWireEnvironment(process.env, directory);
    const remaining = () => { const value = Math.min(10000, Math.floor(30000 - (performance.now() - started))); if (value < 1) fail(); return value; };
    phase = "cli-version";
    const version = await runCli(cli, ["--version"], env, remaining()); cliClosed += Number(version.childClosed); lastCliExit = version.code;
    const cliVersion = /^aws-cli\/(2\.[0-9]+\.[0-9]+)\b/.exec(version.stdout)?.[1];
    if (version.failed || version.code !== 0 || version.signal !== null || !cliVersion) fail();
    for (const mode of ["argv", "cli-input-json"]) {
      phase = mode;
      const result = await runCli(cli, localIamWireArguments(`http://127.0.0.1:${address.port}`, mode), env, remaining());
      cliClosed += Number(result.childClosed); lastCliExit = result.code;
      if (result.failed || result.code !== 0 || result.signal !== null || requestFailure) fail();
      const value = JSON.parse(result.stdout), row = value.EvaluationResults?.[0];
      if (value.IsTruncated !== false || value.EvaluationResults?.length !== 1 || row?.EvalActionName !== ACTION ||
          row?.EvalResourceName !== RESOURCE || row?.EvalDecision !== "allowed") fail();
    }
    phase = "request-match";
    if (requests !== 2 || records.length !== 2 || records[0].normalizedRequestSha256 !== records[1].normalizedRequestSha256 ||
        performance.now() - started > 30000) fail();
    proof = { mode: "unsigned-local-iam-cli-wire-proof", cliVersion, cliInvocations: cliClosed, loopbackRequests: requests,
      wireQueryInputsMatched: true, signedAwsWireVerified: false, evaluationResponsesSynthetic: true,
      awsCalls: 0, externalNetworkCalls: 0, realCredentialsPassed: false, privateConfigRead: false,
      liveAuthorizationVerified: false, permissionsGateUnchanged: true, policyAttached: false,
      readyForDeployment: false, rawInputSuppressed: true };
  } catch { failed = true; }
  finally {
    server.closeAllConnections();
    if (server.listening) await new Promise(done => server.close(error => { serverClosed = !error; done(); }));
    else serverClosed = true;
    if (safeLocalIamWireTemporary(base, directory, physicalBase, marker)) {
      rmSync(directory, { recursive: true }); temporaryTreeRetained = false;
    }
    if (!serverClosed || temporaryTreeRetained) fail();
  }
  if (failed) throw new LocalWireFailure({ phase, observedProtocol: protocol, loopbackRequestsObserved: Math.min(requests, 32),
    cliChildrenClosed: cliClosed, lastCliExit: Number.isInteger(lastCliExit) && lastCliExit >= 0 && lastCliExit <= 255 ? lastCliExit : null,
    serverClosed, temporaryTreeRetained });
  return { ...proof, serverClosed, temporaryTreeRetained, allCliChildrenClosed: cliClosed === 3 };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2);
    if (!args.length) console.log(JSON.stringify(localIamWirePlan()));
    else { if (args.length !== 1 || args[0] !== "--execute-local-cli") fail(); console.log(JSON.stringify(await executeLocalIamWireProof())); }
  } catch (error) { console.error(JSON.stringify({ error: "LOCAL_IAM_WIRE_PROOF_INCOMPLETE", rawInputSuppressed: true,
    ...(error instanceof LocalWireFailure ? { diagnostic: error.facts } : {}),
    liveAuthorizationVerified: false, permissionsGateUnchanged: true, independentLocalClosureRequired: true })); process.exitCode = 1; }
}
