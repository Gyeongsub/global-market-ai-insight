import assert from "node:assert/strict";
import test from "node:test";
import { evaluatePhase11ConsoleExportNames, evaluatePhase11Imports } from "../phase11-import-readiness.js";

const prefix = "global-market-ai-insight-dev";
const sourceName = `${prefix}-compute:ExportsOutputRefControllerABC123`;
const otherName = `${prefix}-api:ExportsOutputRefHttpApiDEF456`;
const templates = () => ({
  [`${prefix}-operations`]: { Resources: { First: { Properties: { Name: { "Fn::ImportValue": sourceName } } }, Second: { Properties: { Id: { "Fn::ImportValue": otherName } } } } },
  [`${prefix}-alarm-circuit`]: { Resources: { First: { Properties: { Name: { "Fn::ImportValue": sourceName } } } } },
});
const inventory = () => ({ Exports: [{ Name: sourceName, Value: "PRIVATE_VALUE" }, { Name: otherName, Value: "PRIVATE_VALUE" }] });

test("exclusive target diff requires all exact live exports but never authorizes deployment", () => {
  const report = evaluatePhase11Imports(templates(), inventory());
  assert.equal(report.distinctImports, 2);
  assert.equal(report.missingImports, 0);
  assert.equal(report.readyForExclusiveTargetDiff, true);
  assert.equal(report.readyForDeployment, false);
  assert.equal(report.upstreamDeploymentAuthorized, false);
  const serialized = JSON.stringify(report);
  for (const hidden of [sourceName, otherName, "PRIVATE_VALUE", "ExportsOutput"]) assert.equal(serialized.includes(hidden), false);
});

test("local synthesis without a live export inventory is never exclusive-deploy proof", () => {
  const report = evaluatePhase11Imports(templates());
  assert.equal(report.liveExportInventoryComplete, false);
  assert.equal(report.missingImports, null);
  assert.equal(report.readyForExclusiveTargetDiff, false);
});

test("missing new cross-stack exports fail before an exclusive retry", () => {
  const report = evaluatePhase11Imports(templates(), { Exports: [] });
  assert.equal(report.missingImports, 2);
  assert.equal(report.readyForExclusiveTargetDiff, false);
});

test("partial, duplicate and malformed export inventories stay unknown", () => {
  for (const value of [null, {}, { Exports: [], NextToken: "PRIVATE_VALUE" }, { Exports: [null] },
    { Exports: [{ Name: sourceName }] }, { Exports: [{ Name: sourceName, Value: "PRIVATE_VALUE" }, { Name: sourceName, Value: "PRIVATE_VALUE" }] }]) {
    const report = evaluatePhase11Imports(templates(), value);
    assert.equal(report.liveExportInventoryComplete, false);
    assert.equal(report.missingImports, null);
    assert.equal(report.readyForExclusiveTargetDiff, false);
  }
});

test("dynamic, foreign or malformed imports cannot silently disappear", () => {
  for (const value of [{ "Fn::Sub": "PRIVATE_VALUE" }, "PRIVATE_VALUE", null, 42]) {
    const input = templates();
    (input[`${prefix}-operations`]!.Resources.First.Properties.Name as Record<string, unknown>)["Fn::ImportValue"] = value;
    const report = evaluatePhase11Imports(input, inventory());
    assert.equal(report.unresolvedImports, 1);
    assert.equal(report.readyForExclusiveTargetDiff, false);
    assert.equal(JSON.stringify(report).includes("PRIVATE_VALUE"), false);
  }
});

test("only the exact two reviewed targets and valid template roots are accepted", () => {
  for (const value of [null, {}, { unrelated: {} }, { ...templates(), upstream: {} },
    { [`${prefix}-operations`]: {}, [`${prefix}-alarm-circuit`]: { Resources: {} } }]) assert.throws(() => evaluatePhase11Imports(value));
});

const consoleInventory = () => ({ source: "console-export-names", region: "ap-northeast-1", allPagesObserved: true, filterEmpty: true, exportNames: [sourceName, otherName] });

test("complete console names can detect a missing prerequisite without upgrading live readiness", () => {
  const input = consoleInventory();
  input.exportNames = [sourceName];
  const report = evaluatePhase11ConsoleExportNames(templates(), input);
  assert.equal(report.consoleExportNameInventoryComplete, true);
  assert.equal(report.missingImportNames, 1);
  for (const key of ["exportValuesVerified", "liveExportInventoryComplete", "failureRootCauseConfirmed", "readyForExclusiveTargetDiff", "readyForDeployment", "upstreamDeploymentAuthorized"]) assert.equal(report[key], false);
  for (const hidden of [sourceName, otherName, "ExportsOutput"]) assert.equal(JSON.stringify(report).includes(hidden), false);
});

test("even all matching console names do not authorize diff, deployment or upstream updates", () => {
  const report = evaluatePhase11ConsoleExportNames(templates(), consoleInventory());
  assert.equal(report.missingImportNames, 0);
  assert.equal(report.readyForExclusiveTargetDiff, false);
  assert.equal(report.readyForDeployment, false);
});

test("filtered, partial, foreign, duplicate, malformed or oversized console observations stay unknown", () => {
  for (const input of [null, {}, { ...consoleInventory(), allPagesObserved: false },
    { ...consoleInventory(), filterEmpty: false }, { ...consoleInventory(), region: "us-east-1" },
    { ...consoleInventory(), source: "synthetic" }, { ...consoleInventory(), exportNames: [sourceName, sourceName] },
    { ...consoleInventory(), exportNames: [null] }, { ...consoleInventory(), exportNames: ["PRIVATE VALUE"] },
    { ...consoleInventory(), exportNames: Array.from({ length: 1001 }, (_, index) => `Export${index}`) },
    { ...consoleInventory(), exportNames: ["x".repeat(256)] }, { ...consoleInventory(), Value: "PRIVATE_VALUE" }]) {
    const report = evaluatePhase11ConsoleExportNames(templates(), input);
    assert.equal(report.consoleExportNameInventoryComplete, false);
    assert.equal(report.missingImportNames, null);
    assert.equal(report.readyForDeployment, false);
  }
});

test("console comparison retains unresolved import and target validation protections", () => {
  const input = templates();
  (input[`${prefix}-operations`]!.Resources.First.Properties.Name as Record<string, unknown>)["Fn::ImportValue"] = { "Fn::Sub": "PRIVATE_VALUE" };
  const report = evaluatePhase11ConsoleExportNames(input, consoleInventory());
  assert.equal(report.unresolvedImports, 1);
  assert.equal(report.readyForExclusiveTargetDiff, false);
  assert.throws(() => evaluatePhase11ConsoleExportNames({}, consoleInventory()));
});
