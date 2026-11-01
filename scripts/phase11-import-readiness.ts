const PREFIX = "global-market-ai-insight-dev";
const TARGETS = [`${PREFIX}-operations`, `${PREFIX}-alarm-circuit`] as const;
const MAX_BYTES = 2_000_000;
type JsonObject = Record<string, unknown>;

function object(value: unknown): JsonObject | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : null;
}

function importNames(template: unknown): { names: Set<string>; unresolved: number } {
  const root = object(template);
  if (!root || !object(root.Resources) || Buffer.byteLength(JSON.stringify(root), "utf8") > MAX_BYTES) throw new Error("IMPORT_TEMPLATE_INVALID");
  const names = new Set<string>();
  let unresolved = 0;
  function walk(value: unknown, depth: number): void {
    if (depth > 64) throw new Error("IMPORT_TEMPLATE_INVALID");
    if (Array.isArray(value)) { for (const item of value) walk(item, depth + 1); return; }
    const node = object(value);
    if (!node) return;
    if (Object.hasOwn(node, "Fn::ImportValue")) {
      const name = node["Fn::ImportValue"];
      if (Object.keys(node).length === 1 && typeof name === "string" && name.length <= 256 &&
          new RegExp(`^${PREFIX}-(foundation|compute|api):ExportsOutput[A-Za-z0-9]+$`).test(name)) names.add(name);
      else unresolved += 1;
    }
    for (const child of Object.values(node)) walk(child, depth + 1);
  }
  walk(root, 0);
  return { names, unresolved };
}

/** Inspect reviewed target templates and an in-memory, single-page export read. */
export function evaluatePhase11Imports(templates: unknown, deployedExports?: unknown): Record<string, unknown> {
  const byTarget = object(templates);
  if (!byTarget || Object.keys(byTarget).length !== 2 || TARGETS.some(target => !Object.hasOwn(byTarget, target))) throw new Error("IMPORT_TARGETS_INVALID");
  const collected = TARGETS.map(target => importNames(byTarget[target]));
  const names = new Set(collected.flatMap(value => [...value.names]));
  const unresolved = collected.reduce((sum, value) => sum + value.unresolved, 0);
  const response = object(deployedExports);
  let inventoryComplete = response !== null && response.NextToken === undefined && response.nextToken === undefined && Array.isArray(response.Exports);
  const available = new Set<string>();
  if (inventoryComplete) {
    for (const candidate of response!.Exports as unknown[]) {
      const entry = object(candidate);
      const name = entry?.Name;
      if (!entry || typeof name !== "string" || name.length === 0 || name.length > 256 ||
          typeof entry.Value !== "string" || entry.Value.length === 0 || entry.Value.length > 4096 || available.has(name)) {
        inventoryComplete = false;
        break;
      }
      available.add(name);
    }
  }
  const missingImports = inventoryComplete ? [...names].filter(name => !available.has(name)).length : null;
  return {
    mode: "local-phase11-import-readiness",
    awsCalls: 0,
    cloudMutations: 0,
    rawIdentifiersPrinted: false,
    targetImportCounts: Object.fromEntries(TARGETS.map((target, index) => [target, collected[index]!.names.size])),
    distinctImports: names.size,
    unresolvedImports: unresolved,
    liveExportInventoryComplete: inventoryComplete,
    missingImports,
    readyForExclusiveTargetDiff: inventoryComplete && unresolved === 0 && missingImports === 0,
    readyForDeployment: false,
    upstreamDeploymentAuthorized: false,
  };
}

/** Console names can establish a missing prerequisite, never value validity or deployment readiness. */
export function evaluatePhase11ConsoleExportNames(templates: unknown, observation: unknown): Record<string, unknown> {
  const baseline = evaluatePhase11Imports(templates);
  const inventory = object(observation);
  const entries = inventory?.exportNames;
  const expectedKeys = ["allPagesObserved", "exportNames", "filterEmpty", "region", "source"];
  const complete = inventory !== null && Object.keys(inventory).sort().join() === expectedKeys.join() &&
    inventory.source === "console-export-names" && inventory.region === "ap-northeast-1" &&
    inventory.allPagesObserved === true && inventory.filterEmpty === true && Array.isArray(entries) &&
    entries.length <= 1000 && entries.every(name => typeof name === "string" && /^[A-Za-z0-9:._\/-]{1,255}$/.test(name)) &&
    new Set(entries).size === entries.length;
  const byTarget = object(templates)!; // Validated by the baseline evaluator.
  const required = new Set(TARGETS.flatMap(target => [...importNames(byTarget[target]).names]));
  const missing = complete ? [...required].filter(name => !(entries as string[]).includes(name)).length : null;
  return {
    ...baseline,
    mode: "local-phase11-console-export-name-comparison",
    consoleExportNameInventoryComplete: complete,
    observedExportNames: complete ? (entries as string[]).length : null,
    missingImportNames: missing,
    exportValuesVerified: false,
    failureRootCauseConfirmed: false,
    readyForExclusiveTargetDiff: false,
    readyForDeployment: false,
    upstreamDeploymentAuthorized: false,
  };
}
