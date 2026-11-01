import assert from "node:assert/strict";
import test from "node:test";
import { evaluateDependencyLicenseInventory } from "../dependency-license-inventory.mjs";

const lock = () => ({ lockfileVersion: "9.0", packages: { "runtime@1.0.0": {}, "tool@2.0.0": {}, "optional@3.0.0": {} },
  importers: { ".": { dependencies: { runtime: { version: "1.0.0" } } } } });
const packages = () => [{ name: "runtime", version: "1.0.0", license: "MIT" }, { name: "tool", version: "2.0.0", license: "(MIT OR GPL-3.0-or-later)" },
  { name: "optional", version: "3.0.0", license: "MPL-2.0" }];

test("complete metadata retains exact expressions without granting publication or legal approval", () => {
  const result = evaluateDependencyLicenseInventory(lock(), packages());
  assert.equal(result.lockMetadataComplete, true);
  assert.deepEqual(result.manualExpressionReview, ["(MIT OR GPL-3.0-or-later)", "MPL-2.0"]);
  assert.deepEqual(result.directRuntime, [{ name: "runtime", version: "1.0.0", licenseExpression: "MIT", state: "metadata-available" }]);
  for (const field of ["readyForPublication", "freshInstallVerified", "advisoryCheckPerformed", "imageScanPerformed"]) assert.equal(result[field], false);
  assert.equal(result.networkCalls, 0);
});

test("missing platform or stale-version metadata remains unknown rather than silently excluded", () => {
  const result = evaluateDependencyLicenseInventory(lock(), [...packages().slice(0, 2), { name: "optional", version: "2.9.0", license: "MIT" }]);
  assert.equal(result.lockMetadataComplete, false);
  assert.equal(result.metadataMissingOrConflicting, 1);
  assert.deepEqual(result.unresolved, [{ name: "optional", version: "3.0.0", state: "missing-installed-metadata" }]);
});

test("duplicate peer instances must agree on their license expression", () => {
  const consistent = evaluateDependencyLicenseInventory(lock(), [...packages(), packages()[0]]);
  assert.equal(consistent.metadataAvailable, 3);
  const conflicting = evaluateDependencyLicenseInventory(lock(), [...packages(), { name: "runtime", version: "1.0.0", license: "ISC" }]);
  assert.equal(conflicting.lockMetadataComplete, false);
  assert.equal(conflicting.directRuntime[0].state, "missing-or-conflicting-license");
});

test("malformed license values are not printed and missing license metadata is not approved", () => {
  const values = packages();
  values[0].license = "PRIVATE_VALUE\nSECRET";
  const result = evaluateDependencyLicenseInventory(lock(), values);
  assert.equal(result.directRuntime[0].licenseExpression, null);
  assert.equal(JSON.stringify(result).includes("PRIVATE_VALUE"), false);
  assert.equal(result.lockMetadataComplete, false);
});

test("unknown lock versions, identity URLs and inconsistent direct dependencies fail closed", () => {
  for (const invalid of [{ ...lock(), lockfileVersion: "8.0" }, { ...lock(), packages: { "https://private.example": {} } },
    { ...lock(), importers: { ".": { dependencies: { runtime: { version: "2.0.0" } } } } }]) {
    assert.throws(() => evaluateDependencyLicenseInventory(invalid, packages()));
  }
});

test("frontend and backend runtime dependencies are both represented and peer suffixes stay lock-aligned", () => {
  const value = lock();
  value.importers.frontend = { dependencies: { tool: { version: "2.0.0(runtime@1.0.0)" } } };
  const result = evaluateDependencyLicenseInventory(value, packages());
  assert.equal(result.directRuntime.length, 2);
  assert.equal(result.directRuntime[1].name, "tool");
});
