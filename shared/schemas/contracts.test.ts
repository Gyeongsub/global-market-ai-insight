import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PROMPT_VERSION } from "../../services/worker/src/analysis.js";

function json(path: string) {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8")) as Record<string, any>;
}

test("keeps schema allowlists aligned with the asset catalog", () => {
  const catalog = json("../asset_catalog/assets.json");
  const request = json("./create-job.request.schema.json");
  assert.deepEqual(request.properties.symbol.enum, catalog.assets.map((asset: { symbol: string }) => asset.symbol));
  assert.deepEqual(request.properties.locale.enum, ["en", "ja", "ko"]);
  assert.deepEqual(request.properties.operation.enum, ["PRICE", "ANALYZE"]);
});

test("requires freshness, provenance, uncertainty, and disclaimer fields", () => {
  const price = json("./price-result.schema.json");
  const analysis = json("./analysis-result.schema.json");
  for (const field of ["marketTimestamp", "retrievedAt", "marketState", "freshness", "source"]) assert.ok(price.required.includes(field));
  for (const field of ["uncertainty", "dataAsOf", "modelId", "promptVersion", "disclaimer"]) assert.ok(analysis.required.includes(field));
});

test("analysis schema accepts the deployed prompt version without allowing unknown prompts", () => {
  const analysis = json("./analysis-result.schema.json");
  assert.equal(analysis.properties.promptVersion.const, PROMPT_VERSION);
  assert.notEqual(analysis.properties.promptVersion.const, "v1");
});

test("keeps the model-output boundary compact and closed", () => {
  const modelOutput = json("./model-analysis-output.schema.json");
  assert.equal(modelOutput.additionalProperties, false);
  assert.deepEqual(modelOutput.required, [
    "summary",
    "observations",
    "opportunities",
    "risks",
    "specialConsiderations",
    "uncertainty",
  ]);
  assert.equal(modelOutput.properties.summary.maxLength, 240);
  assert.equal(modelOutput.$defs.compactStringList.maxItems, 2);
  assert.equal(modelOutput.$defs.compactStringList.items.maxLength, 180);
  assert.equal(modelOutput.properties.risks.allOf[1].minItems, 1);
});

test("keeps internal job identifiers out of the public API schema", () => {
  const stored = json("./job.schema.json");
  const publicResponse = json("./job-response.schema.json");
  const accepted = json("./accepted-job.schema.json");
  for (const internal of ["idempotencyKeyHash", "requestHash", "taskArn"]) {
    assert.equal(internal in publicResponse.properties, false);
    assert.equal(internal in accepted.properties, false);
  }
  assert.equal("idempotencyKeyHash" in stored.properties, true);
  assert.equal(publicResponse.additionalProperties, false);
  assert.equal(accepted.additionalProperties, false);
});
