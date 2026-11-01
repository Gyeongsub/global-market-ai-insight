import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { createPhase11ReadOnlyCliRunner, PHASE11_LOG_GROUP_PAGE_LIMIT, phase11ReadOnlyChildEnvironment, summarizeReadinessFailure, validatePhase11ReadOnlyQuery } from "../phase11-live-readiness.js";

const prefix = "global-market-ai-insight-dev";
const common = (service: string, operation: string, extras: string[] = [], region = "ap-northeast-1") =>
  [service, operation, ...extras, "--profile", "gmai-admin", "--region", region, "--no-cli-pager", "--no-paginate", "--output", "json"];

test("read-only CLI children inherit bootstrap/profile location only, not unrelated credentials or transport overrides", () => {
  const privateNames = ["UNRECOGNIZED_VENDOR_AUTH", "CUSTOM_SESSION", "AWS_CA_BUNDLE", "REQUESTS_CA_BUNDLE", "SSL_CERT_FILE", "BOTO_CONFIG",
    "HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "NO_PROXY", "PYTHONPATH", "PYTHONSTARTUP", "NODE_OPTIONS", "AWS_CLI_HISTORY_FILE", "AWS_SHARED_CREDENTIALS_FILE",
    "GMAI_ENABLE_INTERNAL_JOBS", "GMAI_ENABLE_LIVE_RESULT_DISPLAY", "CDK_CONTEXT_JSON"];
  const input = {...Object.fromEntries(privateNames.map(name => [name, "PRIVATE_SENTINEL"])), Path: "bootstrap", AWS_CONFIG_FILE: "profile-location"};
  const output = phase11ReadOnlyChildEnvironment(input);
  for (const name of privateNames) assert.equal(output[name], undefined, name);
  assert.equal(output.Path, "bootstrap"); assert.equal(output.AWS_CONFIG_FILE, "profile-location");
  assert.equal(input.UNRECOGNIZED_VENDOR_AUTH, "PRIVATE_SENTINEL");
});

test("read-only CLI children refuse conflicting OS/profile case aliases and malformed retained values", () => {
  for (const source of [{PATH: "one", Path: "two"}, {AWS_CONFIG_FILE: "one", aws_config_file: "two"},
    {AWS_CONFIG_FILE: "PRIVATE\nSENTINEL"}, {AWS_CONFIG_FILE: "PRIVATE\0SENTINEL"}, {Path: "PRIVATE\rSENTINEL"}]) {
    assert.throws(() => phase11ReadOnlyChildEnvironment(source));
  }
  const output = phase11ReadOnlyChildEnvironment({Path: "one", PATH: "one", AWS_CONFIG_FILE: "profile-location", aws_config_file: "profile-location"});
  assert.equal(Object.keys(output).filter(name => name.toUpperCase() === "PATH").length, 1);
  assert.equal(Object.keys(output).filter(name => name.toUpperCase() === "AWS_CONFIG_FILE").length, 1);
});

test("the actual read runner passes no unknown secret or Python/TLS override to the injected CLI", () => {
  const names = ["UNRECOGNIZED_VENDOR_AUTH", "PYTHONPATH", "REQUESTS_CA_BUNDLE"];
  const prior = names.map(name => process.env[name]);
  try {
    for (const name of names) process.env[name] = "PRIVATE_SENTINEL";
    let calls = 0;
    const runner = createPhase11ReadOnlyCliRunner({now: () => 1000, spawn: (_executable, _args, options) => {
      calls++; for (const name of names) assert.equal(options.env[name], undefined, name);
      assert.equal(options.env.AWS_PROFILE, "gmai-admin"); return {status: 0, signal: null, stdout: "{}"};
    }});
    runner(common("sts", "get-caller-identity")); assert.equal(calls, 1);
  } finally {
    names.forEach((name, index) => { if (prior[index] === undefined) delete process.env[name]; else process.env[name] = prior[index]; });
  }
});

test("an actual child of the read runner sees only the projected environment, not the parent sentinel", () => {
  const before = process.env.UNRECOGNIZED_VENDOR_AUTH;
  try {
    process.env.UNRECOGNIZED_VENDOR_AUTH = "PRIVATE_SENTINEL";
    let calls = 0;
    const runner = createPhase11ReadOnlyCliRunner({now: () => 1000, spawn: (_executable, _args, options) => {
      calls++;
      return spawnSync(process.execPath, ["-e", 'if(process.env.UNRECOGNIZED_VENDOR_AUTH!==undefined||process.env.AWS_PROFILE!=="gmai-admin"||process.env.AWS_IGNORE_CONFIGURED_ENDPOINT_URLS!=="true"||process.env.NODE_TLS_REJECT_UNAUTHORIZED!=="1")process.exit(1);process.stdout.write("{\\"boundaryVerified\\":true}");'], options);
    }});
    assert.deepEqual(runner(common("sts", "get-caller-identity")), {boundaryVerified: true});
    assert.equal(calls, 1);
  } finally { if (before === undefined) delete process.env.UNRECOGNIZED_VENDOR_AUTH; else process.env.UNRECOGNIZED_VENDOR_AUTH = before; }
});

test("all intended read stages accept only their fixed query shape", () => {
  for (const args of [
    common("sts", "get-caller-identity"),
    common("budgets", "describe-budgets", ["--account-id", ["123456", "789012"].join(""), "--max-results", "100"], "us-east-1"),
    common("cloudformation", "describe-stacks"),
    common("cloudformation", "list-stack-resources", ["--stack-name", `${prefix}-foundation`]),
    common("lambda", "get-function-configuration", ["--function-name", `${prefix}-controller`]),
    common("ecs", "list-tasks", ["--cluster", `${prefix}-worker`, "--desired-status", "RUNNING"]),
    common("ecs", "list-services", ["--cluster", `${prefix}-worker`]),
    common("ecs", "describe-task-definition", ["--task-definition", `arn:aws:ecs:ap-northeast-1:${["123456", "789012"].join("")}:task-definition/${prefix}-worker:9`]),
    common("dynamodb", "get-item", ["--table-name", `${prefix}-jobs`, "--key", JSON.stringify({ jobId: { S: "control_circuit" } }), "--consistent-read"]),
    common("dynamodb", "describe-table", ["--table-name", `${prefix}-jobs`]),
    ...["get-api", "get-routes", "get-integrations"].map(operation => common("apigatewayv2", operation, ["--api-id", "example123"])),
    common("logs", "describe-log-groups", ["--log-group-name-prefix", `/aws/ecs/${prefix}/worker`, "--limit", PHASE11_LOG_GROUP_PAGE_LIMIT]),
  ]) assert.equal(validatePhase11ReadOnlyQuery(args), `${args[0]}.${args[1]}`);
});

test("destination overrides, TLS weakening, debug and changed profile, Region or pagination are rejected", () => {
  const query = common("sts", "get-caller-identity");
  for (const args of [
    [...query, "--endpoint-url", "https://private.example"], [...query, "--no-verify-ssl"], [...query, "--debug"],
    [...query, "--profile", "another"], query.map(value => value === "gmai-admin" ? "another" : value),
    query.map(value => value === "ap-northeast-1" ? "us-west-2" : value),
    query.filter(value => value !== "--no-paginate"), query.map(value => value === "json" ? "text" : value),
    [...query, "--query", "PRIVATE_VALUE"], [...query, "--no-cli-pager"],
  ]) assert.throws(() => validatePhase11ReadOnlyQuery(args));
});

test("foreign resources, broad prefixes, unexpected keys and file-based inputs fail before spawning", () => {
  for (const args of [
    common("cloudformation", "list-stack-resources", ["--stack-name", "another-project"]),
    common("lambda", "get-function-configuration", ["--function-name", "another-function"]),
    common("ecs", "list-tasks", ["--cluster", "another-cluster", "--desired-status", "RUNNING"]),
    common("ecs", "list-tasks", ["--cluster", `${prefix}-worker`, "--desired-status", "STOPPED"]),
    common("logs", "describe-log-groups", ["--log-group-name-prefix", "/aws/", "--limit", "100"]),
    common("logs", "describe-log-groups", ["--log-group-name-prefix", `/aws/ecs/${prefix}/worker`, "--limit", "1000"]),
    common("apigatewayv2", "get-api", ["--api-id", "PRIVATE_BAD_VALUE"]),
    common("dynamodb", "describe-table", ["--table-name", "another-table"]),
    common("dynamodb", "get-item", ["--table-name", `${prefix}-jobs`, "--key", "file://private.json", "--consistent-read"]),
    common("dynamodb", "get-item", ["--table-name", `${prefix}-jobs`, "--key", JSON.stringify({ jobId: { S: "another-key" } }), "--consistent-read"]),
    common("dynamodb", "get-item", ["--table-name", `${prefix}-jobs`, "--key", JSON.stringify({ jobId: { S: "control_circuit" }, extra: {} }), "--consistent-read"]),
  ]) assert.throws(() => validatePhase11ReadOnlyQuery(args));
});

test("DynamoDB string keys cannot be coerced from arrays or objects", () => {
  for (const S of [["control_circuit"], {}, 0, null]) {
    assert.throws(() => validatePhase11ReadOnlyQuery(common("dynamodb", "get-item", ["--table-name", `${prefix}-jobs`, "--key", JSON.stringify({ jobId: { S } }), "--consistent-read"])));
  }
});

test("child process cannot inherit static tokens, credential URLs, service models or endpoint overrides", () => {
  const names = ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_SESSION_TOKEN", "AWS_DATA_PATH", "AWS_ENDPOINT_URL", "AWS_ENDPOINT_URL_STS",
    "AWS_WEB_IDENTITY_TOKEN_FILE", "AWS_ROLE_ARN", "AWS_CONTAINER_CREDENTIALS_FULL_URI", "AWS_CONTAINER_CREDENTIALS_RELATIVE_URI",
    "AWS_CONTAINER_AUTHORIZATION_TOKEN", "AWS_CONTAINER_AUTHORIZATION_TOKEN_FILE"];
  const input = Object.fromEntries(names.map(name => [name, "PRIVATE_VALUE"]));
  const result = phase11ReadOnlyChildEnvironment({ ...input, PATH: "preserved", AWS_CONFIG_FILE: "private-profile-location" });
  for (const name of names) assert.equal(result[name], undefined);
  assert.equal(result.AWS_IGNORE_CONFIGURED_ENDPOINT_URLS, "true");
  assert.equal(result.AWS_EC2_METADATA_DISABLED, "true");
  assert.equal(result.AWS_MAX_ATTEMPTS, "1");
  assert.equal(result.AWS_CLI_AUTO_PROMPT, "off");
  assert.equal(result.AWS_PAGER, "");
  assert.equal(result.AWS_PROFILE, "gmai-admin");
  assert.equal(result.PATH, "preserved");
  assert.equal(result.AWS_CONFIG_FILE, "private-profile-location");
  assert.equal(input.AWS_ENDPOINT_URL, "PRIVATE_VALUE");
});

test("Windows-style mixed-case environment keys cannot shadow the fixed security settings", () => {
  const output = phase11ReadOnlyChildEnvironment({ aws_endpoint_url: "PRIVATE_VALUE", Aws_Secret_Access_Key: "PRIVATE_VALUE", aws_profile: "another",
    aws_max_attempts: "999", aws_ignore_configured_endpoint_urls: "false", Path: "preserved" });
  for (const key of ["aws_endpoint_url", "Aws_Secret_Access_Key", "aws_profile", "aws_max_attempts", "aws_ignore_configured_endpoint_urls"]) assert.equal(output[key], undefined);
  assert.equal(output.AWS_PROFILE, "gmai-admin");
  assert.equal(output.AWS_MAX_ATTEMPTS, "1");
  assert.equal(output.AWS_IGNORE_CONFIGURED_ENDPOINT_URLS, "true");
  assert.equal(output.Path, "preserved");
});

test("query runner stops at twelve reads without actually executing an AWS CLI", () => {
  let calls = 0;
  const run = createPhase11ReadOnlyCliRunner({ now: () => 1000, spawn: () => { calls += 1; return { status: 0, signal: null, stdout: "{}" }; } });
  for (let index = 0; index < 12; index += 1) assert.deepEqual(run(common("sts", "get-caller-identity")), {});
  assert.throws(() => run(common("sts", "get-caller-identity")), error => {
    assert.equal(summarizeReadinessFailure(error).error, "AWS_READ_LIMIT_EXCEEDED"); return true;
  });
  assert.equal(calls, 12);
});

test("query runner enforces remaining timeout and rejects expired, backwards or invalid clocks", () => {
  let now = 1000;
  let calls = 0;
  const run = createPhase11ReadOnlyCliRunner({ now: () => now, spawn: (_command, _args, options) => {
    calls += 1; assert.equal(options.timeout, 10_000); return { status: 0, signal: null, stdout: "{}" };
  } });
  now += 170_000;
  run(common("sts", "get-caller-identity"));
  now += 10_000;
  assert.throws(() => run(common("sts", "get-caller-identity")));
  assert.equal(calls, 1);
  now = 0;
  assert.throws(() => run(common("sts", "get-caller-identity")));
  assert.throws(() => createPhase11ReadOnlyCliRunner({ now: () => Number.NaN }));
});

test("untrusted CLI results and failures never escape as raw error details", () => {
  for (const result of [{ status: 1, signal: null, stdout: "PRIVATE_VALUE" }, { status: 0, signal: null, stdout: "PRIVATE_VALUE" },
    { status: 0, signal: null, stdout: "x".repeat(2_000_001) }]) {
    const run = createPhase11ReadOnlyCliRunner({ now: () => 1000, spawn: () => result });
    assert.throws(() => run(common("sts", "get-caller-identity")), error => {
      assert.equal(JSON.stringify(summarizeReadinessFailure(error)).includes("PRIVATE_VALUE"), false); return true;
    });
  }
});
