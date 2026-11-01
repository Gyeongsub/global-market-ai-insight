import { spawnSync } from "node:child_process";
import { lstatSync, readdirSync, realpathSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { cleanSourceChildEnvironment } from "./local-proof-environment.mjs";

export const SERVICE_TEST_CONCURRENCY = 2;

const fail = () => { throw new Error("SERVICE_TEST_SCOPE_INVALID"); };

function fixedTestArguments(root, directories, suffix, typescript) {
  if (typeof root !== "string" || !isAbsolute(root) || root.includes("\0")) fail();
  const base = resolve(root);
  if (realpathSync(base) !== base || lstatSync(base).isSymbolicLink()) fail();
  let entries = 0;
  function collectTests(directory, depth = 0) {
    const offset = relative(base, directory), stat = lstatSync(directory), files = [];
    if (depth > 12 || !offset || offset === ".." || offset.startsWith(`..${sep}`) || isAbsolute(offset) ||
        stat.isSymbolicLink() || realpathSync(directory) !== directory || !stat.isDirectory()) fail();
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (++entries > 10_000 || entry.isSymbolicLink()) fail();
      const path = join(directory, entry.name);
      if (entry.isDirectory()) files.push(...collectTests(path, depth + 1));
      else if (!entry.isFile()) fail();
      else if (entry.name.endsWith(suffix)) {
        if (realpathSync(path) !== path || !lstatSync(path).isFile()) fail();
        files.push(path);
      }
    }
    return files;
  }
  const testFiles = directories
    .flatMap((directory) => collectTests(resolve(base, directory))).sort();
  if (testFiles.length === 0) throw new Error("SERVICE_TEST_FILES_MISSING");
  if (testFiles.length > 1000) fail();
  // The CPU-count default can start dozens of TypeScript/CDK processes at once
  // on this Windows host. Bound resource contention without omitting any file.
  return [...(typescript ? ["--import", "tsx"] : []), "--test", `--test-concurrency=${SERVICE_TEST_CONCURRENCY}`, ...testFiles];
}

export const serviceTestArguments = (root = process.cwd()) =>
  fixedTestArguments(root, ["services", "shared", "frontend/tests", "scripts/tests"], ".test.ts", true);
export const javascriptHelperTestArguments = (root = process.cwd()) =>
  fixedTestArguments(root, ["scripts/tests"], ".test.mjs", false);
export const frontendArtifactTestArguments = (root = process.cwd()) =>
  fixedTestArguments(root, ["frontend/tests"], ".test.mjs", false);

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    if (process.argv.length !== 2) fail();
    const result = spawnSync(process.execPath, serviceTestArguments(), { stdio: "inherit", windowsHide: true,
      env: cleanSourceChildEnvironment(process.env) });
    process.exitCode = result.status === 0 && result.signal === null && !result.error ? 0 : result.status || 1;
  } catch { console.error("SERVICE_TEST_RUN_INCOMPLETE"); process.exitCode = 1; }
}
