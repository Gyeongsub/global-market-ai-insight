import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const SKIP_DIRECTORIES = new Set([".git", "node_modules", ".pnpm-store", ".aws", ".codex", ".agents", ".tmp", "dist", "bundle", "cdk.out", "coverage", "outputs", "work"]);

function markdownFiles(directory, base, findings) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && SKIP_DIRECTORIES.has(entry.name)) continue;
    const path = resolve(directory, entry.name);
    if (entry.isSymbolicLink()) {
      findings.push({ file: relative(base, path), category: "linked-document-source-not-scanned" });
      continue;
    }
    const offset = relative(base, realpathSync(path));
    if (!offset || isAbsolute(offset) || offset === ".." || offset.startsWith(`..${sep}`)) {
      findings.push({ file: relative(base, path), category: "unsafe-document-source-not-scanned" });
      continue;
    }
    if (entry.isDirectory()) files.push(...markdownFiles(path, base, findings));
    else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
      if (statSync(path).size > 2_000_000) findings.push({ file: relative(base, path), category: "oversized-document-not-scanned" });
      else files.push(path);
    }
  }
  return files;
}

function stripFencedCode(markdown) {
  return markdown.replace(/^(?:```|~~~)[^\n]*\n[\s\S]*?^(?:```|~~~)\s*$/gm, "");
}

export function markdownLinkTargets(markdown) {
  const targets = [];
  const content = stripFencedCode(markdown);
  const pattern = /!?\[[^\]]*\]\(\s*(?:<([^>]+)>|([^\s)]+))(?:\s+(?:"[^"]*"|'[^']*'))?\s*\)/g;
  for (const match of content.matchAll(pattern)) targets.push(match[1] ?? match[2]);
  return targets.filter(target => typeof target === "string");
}

export function checkDocumentLinks(root) {
  const base = realpathSync(resolve(root));
  const findings = [];
  let linksChecked = 0;
  const files = markdownFiles(base, base, findings).sort();
  for (const file of files) {
    for (const rawTarget of markdownLinkTargets(readFileSync(file, "utf8"))) {
      if (/^(?:https?:|mailto:|urn:)/i.test(rawTarget) || rawTarget.startsWith("#")) continue;
      linksChecked += 1;
      const pathPart = rawTarget.split("#", 1)[0];
      if (!pathPart || /^[A-Za-z]:[\\/]|^\\\\|^\//.test(pathPart)) {
        findings.push({ file: relative(base, file), category: "absolute-or-invalid-local-link" });
        continue;
      }
      let decoded;
      try { decoded = decodeURIComponent(pathPart); }
      catch { findings.push({ file: relative(base, file), category: "invalid-link-encoding" }); continue; }
      if (isAbsolute(decoded) || /^[A-Za-z][A-Za-z0-9+.-]*:/.test(decoded)) {
        findings.push({ file: relative(base, file), category: "absolute-or-invalid-local-link" });
        continue;
      }
      const destination = resolve(dirname(file), decoded);
      const destinationRelative = relative(base, destination);
      if (!destinationRelative || isAbsolute(destinationRelative) || destinationRelative.startsWith("..") || destinationRelative.startsWith(sep)) {
        findings.push({ file: relative(base, file), category: "link-outside-project" });
        continue;
      }
      if (!existsSync(destination)) {
        findings.push({ file: relative(base, file), category: "missing-local-link" });
        continue;
      }
      const physical = realpathSync(destination);
      const physicalRelative = relative(base, physical);
      if (!physicalRelative || isAbsolute(physicalRelative) || physicalRelative.startsWith("..") || physicalRelative.startsWith(sep) || !statSync(physical).isFile() && !statSync(physical).isDirectory()) {
        findings.push({ file: relative(base, file), category: "unsafe-local-link-target" });
      }
    }
  }
  return { markdownFiles: files.length, linksChecked, findings };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = checkDocumentLinks(process.cwd());
    console.log(JSON.stringify(result));
    if (result.findings.length > 0) process.exitCode = 1;
  } catch {
    console.error(JSON.stringify({ error: "DOCUMENT_CHECK_INCOMPLETE" }));
    process.exitCode = 1;
  }
}
