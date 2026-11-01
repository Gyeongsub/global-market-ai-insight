import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, lstatSync, realpathSync, unlinkSync, rmdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { loadConfigFromFile, loadEnv } from "vite";

const loaded = await loadConfigFromFile({ command: "build", mode: "production" },
  fileURLToPath(new URL("../vite.config.ts", import.meta.url)), undefined, "silent");
assert.ok(loaded);

test("the fixture client disables dotenv loading and generic process-variable prefixes", () => {
  assert.equal(loaded.config.envDir, false);
  assert.deepEqual(loaded.config.envPrefix, []);
  assert.equal(loaded.config.define, undefined, "No explicit process environment substitution is needed for synthetic fixtures.");
});

test("actual pinned Vite does not select synthetic file or process secrets in production or development", () => {
  const base = realpathSync(tmpdir()), directory = mkdtempSync(join(base, "gmai-frontend-env-"));
  const suffixes = ["", ".local", ".production", ".production.local", ".development", ".development.local"];
  const created = [];
  const key = "VITE_GMAI_SYNTHETIC_PROCESS_SENTINEL", previous = process.env[key];
  try {
    process.env[key] = "synthetic-process-value-not-for-client";
    for (const suffix of suffixes) {
      const path = join(directory, `.env${suffix}`);
      writeFileSync(path, "VITE_GMAI_SYNTHETIC_FILE_SENTINEL=synthetic-file-value-not-for-client\n", { flag: "wx" });
      created.push(path);
    }
    for (const mode of ["production", "development"]) {
      // Use the real configured choices, not an inline test override that
      // could silently disable a misconfigured application's env loading.
      const values = loadEnv(mode, loaded.config.envDir === false ? false : directory, loaded.config.envPrefix);
      assert.equal(Object.hasOwn(values, key), false, mode);
      assert.equal(Object.hasOwn(values, "VITE_GMAI_SYNTHETIC_FILE_SENTINEL"), false, mode);
    }
  } finally {
    if (previous === undefined) delete process.env[key]; else process.env[key] = previous;
    // Only this exclusively-created synthetic fixture, never the user's env.
    assert.equal(dirname(directory), base); assert.match(basename(directory), /^gmai-frontend-env-[A-Za-z0-9]+$/);
    assert.equal(realpathSync(directory), directory); assert.equal(lstatSync(directory).isSymbolicLink(), false);
    for (const path of created) {
      assert.equal(realpathSync(path), path); assert.equal(lstatSync(path).isSymbolicLink(), false);
      assert.equal(lstatSync(path).isFile(), true); unlinkSync(path);
    }
    rmdirSync(directory);
  }
});
