import { readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { credentialFindingNames } from "./credential-patterns.mjs";

const root = process.cwd();
const physicalRoot = realpathSync(root);
const scanErrors = [];
const excludedDirectories = new Set([
  ".git",
  "node_modules",
  ".pnpm-store",
  "dist",
  "bundle",
  "cdk.out",
  "coverage",
  "outputs",
  "work",
]);
const textExtensions = new Set([
  ".cjs", ".css", ".env", ".example", ".html", ".js", ".json", ".jsx",
  ".md", ".mjs", ".mts", ".cts", ".patch", ".ps1", ".sh", ".ts", ".tsx", ".txt", ".yaml", ".yml",
]);

function extension(path) {
  const name = path.toLowerCase();
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "" : name.slice(dot);
}

function files(directory) {
  const result = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && excludedDirectories.has(entry.name)) continue;
    const path = resolve(directory, entry.name);
    if (entry.isSymbolicLink()) {
      scanErrors.push({ file: relative(root, path), category: "linked-path-not-scanned" });
      continue;
    }
    const physicalRelative = relative(physicalRoot, realpathSync(path));
    if (!physicalRelative || isAbsolute(physicalRelative) || physicalRelative === ".." || physicalRelative.startsWith(`..${sep}`)) {
      scanErrors.push({ file: relative(root, path), category: "outside-source-path-not-scanned" });
      continue;
    }
    if (entry.isDirectory()) result.push(...files(path));
    else if (entry.isFile() && textExtensions.has(extension(path))) {
      if (statSync(path).size > 2_000_000) scanErrors.push({ file: relative(root, path), category: "oversized-source-not-scanned" });
      else result.push(path);
    }
  }
  return result;
}

const findings = [];
try {
  for (const path of files(root)) {
    let content;
    try {
      content = new TextDecoder("utf-8", { fatal: true }).decode(readFileSync(path));
      if (content.includes("\0")) throw new Error("Ambiguous text");
    } catch { scanErrors.push({ file: relative(root, path), category: "unreviewed-text-encoding" }); continue; }
    for (const detector of credentialFindingNames(content)) findings.push({ file: relative(root, path), detector });
  }
} catch {
  scanErrors.push({ category: "source-read-failed" });
}

if (findings.length > 0 || scanErrors.length > 0) {
  console.error(JSON.stringify({ secretScan: "failed", findings, ...(scanErrors.length ? { scanErrors } : {}) }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({ secretScan: "passed", highConfidenceFindings: 0 }));
