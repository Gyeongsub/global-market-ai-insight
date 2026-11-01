import { resolve } from "node:path";
import { loadProjectConfig } from "../infrastructure/lib/config.js";
import { DynamoDbCircuitStore } from "../services/operations/circuit_control/src/store.js";

// Defaults to a local plan. Explicit execution is an operator Security/Cost
// gate; no credentials, parameter values, table records or raw errors are logged.
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const allowed = new Set(["--action", "--expected-version", "--reason", "--execute", "--confirm-close"]);
  const values = new Map<string, string>();
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]!;
    if (!allowed.has(arg) || values.has(arg)) throw new Error("Invalid operator arguments.");
    if (arg === "--execute" || arg === "--confirm-close") values.set(arg, "true");
    else {
      const value = args[++i];
      if (!value || value.startsWith("--")) throw new Error("Missing operator argument.");
      values.set(arg, value);
    }
  }
  const config = loadProjectConfig(process.env.GMAI_CONFIG ?? resolve("infrastructure/environments/dev.example.json"));
  const action = values.get("--action") ?? "status";
  if (!["status", "open", "close"].includes(action)) throw new Error("Action must be status, open, or close.");
  const expectedVersion = Number(values.get("--expected-version") ?? "-1");
  const reason = values.get("--reason") ?? "operator-check";
  if (action !== "status" && (!Number.isSafeInteger(expectedVersion) || expectedVersion < 0 || !/^[a-zA-Z0-9_.-]{1,128}$/.test(reason))) throw new Error("A valid expected version and non-sensitive reason code are required.");
  if (action === "close" && (expectedVersion === 0 || !values.has("--confirm-close"))) throw new Error("Initialize OPEN first; closing needs a current version and --confirm-close.");
  if (!values.has("--execute")) {
    console.log(JSON.stringify({ mode: "dry-run", action, region: config.region, awsCalls: 0, providerJobsEnabled: false,
      ...(action === "status" ? {} : { expectedVersion, state: action === "open" ? "OPEN" : "CLOSED" }) }));
    return;
  }
  if (process.env.AWS_PROFILE !== "gmai-admin") throw new Error("Use the verified temporary gmai-admin profile for operator execution.");
  const store = new DynamoDbCircuitStore(`${config.projectName}-${config.environment}-jobs`, config.region);
  if (action === "status") {
    const record = await store.read();
    console.log(JSON.stringify({ effectiveState: record?.state ?? "OPEN", version: record?.version ?? null, verifiedRecord: record !== null }));
    return;
  }
  await store.change({ state: action === "open" ? "OPEN" : "CLOSED", reason, actor: "portfolio-operator", expectedVersion, now: new Date(), confirmed: values.has("--confirm-close") });
  console.log(JSON.stringify({ updated: true, state: action === "open" ? "OPEN" : "CLOSED", version: expectedVersion + 1 }));
}

main().catch(() => {
  console.error("Circuit command failed. Verify arguments, temporary session and current version; raw details are suppressed.");
  process.exitCode = 1;
});
