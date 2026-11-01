import assert from "node:assert/strict";
import test from "node:test";
import { parseAwsWorkerConfig } from "../src/worker-config.js";

const valid = {
  AWS_REGION: "ap-northeast-1",
  JOBS_TABLE_NAME: "global-market-ai-insight-dev-jobs",
  TWELVE_DATA_API_KEY: "test-only-key",
  BEDROCK_MODEL_ID: "amazon.nova-lite-v1:0",
  BEDROCK_MAX_OUTPUT_TOKENS: "512",
};

test("parses only bounded Tokyo worker runtime values", () => {
  assert.deepEqual(parseAwsWorkerConfig(valid), {
    region: "ap-northeast-1",
    jobsTableName: "global-market-ai-insight-dev-jobs",
    twelveDataApiKey: "test-only-key",
    bedrockModelId: "amazon.nova-lite-v1:0",
    bedrockMaxOutputTokens: 512,
  });
  assert.throws(() => parseAwsWorkerConfig({ ...valid, AWS_REGION: "us-east-1" }), /ap-northeast-1/);
  assert.throws(() => parseAwsWorkerConfig({ ...valid, BEDROCK_MAX_OUTPUT_TOKENS: "513" }), /128 through 512/);
});

test("does not expose a supplied secret in configuration errors", () => {
  const secret = "do-not-print-this-provider-key";
  assert.throws(
    () => parseAwsWorkerConfig({ ...valid, TWELVE_DATA_API_KEY: secret, JOBS_TABLE_NAME: "?" }),
    (error: unknown) => error instanceof Error && !error.message.includes(secret),
  );
});
