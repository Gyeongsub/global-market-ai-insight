import { spawnSync } from "node:child_process";
import { lstatSync, readdirSync, realpathSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { cleanSourceChildEnvironment } from "./local-proof-environment.mjs";

export const INFRA_TEST_CONCURRENCY = 2;
const fail = () => { throw new Error("INFRA_TEST_SCOPE_INVALID"); };

/** Discover every infrastructure test without following links or accepting a
 * caller-selected file/skip pattern. Direct Node import avoids an extra launcher;
 * it does not cache results, skip assertions or change the whole-gate deadline. */
export function infrastructureTestArguments(root = process.cwd()) {
  if (typeof root !== "string" || !isAbsolute(root) || root.includes("\0")) fail();
  const base = resolve(root);
  if (realpathSync(base) !== base || lstatSync(base).isSymbolicLink()) fail();
  const directory = join(base, "infrastructure", "tests"), files = [];
  let entries = 0;
  function walk(path, depth) {
    const offset = relative(base, path), stat = lstatSync(path);
    if (depth > 12 || !offset || offset === ".." || offset.startsWith(`..${sep}`) || isAbsolute(offset) ||
        stat.isSymbolicLink() || realpathSync(path) !== path || !stat.isDirectory()) fail();
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      if (++entries > 1000 || entry.isSymbolicLink()) fail();
      const file = join(path, entry.name);
      if (entry.isDirectory()) walk(file, depth + 1);
      else if (!entry.isFile()) fail();
      else if (entry.name.endsWith(".test.ts")) {
        if (realpathSync(file) !== file || !lstatSync(file).isFile()) fail();
        files.push(file);
      }
    }
  }
  walk(directory, 0);
  if (files.length < 1 || files.length > 100) fail();
  return ["--import", "tsx", "--test", `--test-concurrency=${INFRA_TEST_CONCURRENCY}`, ...files.sort()];
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    if (process.argv.length !== 2) fail();
    const result = spawnSync(process.execPath, infrastructureTestArguments(), {
      cwd: process.cwd(), stdio: "inherit", windowsHide: true, env: cleanSourceChildEnvironment(process.env),
    });
    process.exitCode = result.status === 0 && result.signal === null && !result.error ? 0 : result.status || 1;
  } catch {
    console.error(JSON.stringify({ error: "INFRA_TEST_SCOPE_INVALID", rawDetailsSuppressed: true }));
    process.exitCode = 1;
  }
}
