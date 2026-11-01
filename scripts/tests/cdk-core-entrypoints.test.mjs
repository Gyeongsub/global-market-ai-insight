import assert from "node:assert/strict";
import { readFileSync, readdirSync, lstatSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import ts from "typescript";

test("pinned CDK publicly exports core and all used runtime values are the same objects", async () => {
  const pkg = JSON.parse(readFileSync("node_modules/aws-cdk-lib/package.json", "utf8"));
  assert.equal(pkg.name, "aws-cdk-lib"); assert.equal(pkg.version, "2.263.0");
  assert.equal(pkg.exports["./core"], "./core/index.js");
  const root = await import("aws-cdk-lib"), core = await import("aws-cdk-lib/core");
  for (const name of ["App", "Arn", "ArnFormat", "CfnOutput", "CfnResource", "Duration", "Fn", "RemovalPolicy", "Size", "Stack", "Tags", "Token"])
    assert.equal(core[name], root[name]);
  assert.match(readFileSync("node_modules/aws-cdk-lib/index.d.ts", "utf8"), /export \* from ['"]\.\/core['"]/);
});

test("infrastructure and typed operator imports use the public core export rather than the whole service barrel", () => {
  let files = 0, rootImports = 0;
  function inspect(path, depth = 0) {
    assert.ok(depth < 14); assert.equal(lstatSync(path).isSymbolicLink(), false);
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      const child = join(path, entry.name);
      assert.equal(entry.isSymbolicLink(), false);
      if (entry.isDirectory()) { if (!["node_modules", "cdk.out", "dist", "bundle"].includes(entry.name)) inspect(child, depth + 1); }
      else if (entry.name.endsWith(".ts")) {
        assert.ok(++files <= 1000);
        const text = readFileSync(child, "utf8"); assert.ok(text.length < 2000000);
        const source = ts.createSourceFile("source.ts", text, ts.ScriptTarget.ESNext, true);
        const visit = node => {
          if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier) && node.moduleSpecifier.text === "aws-cdk-lib") rootImports++;
          if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword &&
              node.arguments.length === 1 && ts.isStringLiteral(node.arguments[0]) && node.arguments[0].text === "aws-cdk-lib") rootImports++;
          ts.forEachChild(node, visit);
        };
        visit(source);
      }
    }
  }
  inspect("infrastructure"); inspect("scripts");
  assert.ok(files > 50); assert.equal(rootImports, 0);
});
