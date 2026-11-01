import assert from "node:assert/strict";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import * as worker from "../../services/worker/src/main.js";

const {runWorkerRuntimeScenarios}=await import(pathToFileURL(resolve("scripts/fixtures/worker-runtime-fixture.mjs")).href);

test("the inert runtime fixture exercises 30 normal and fifteen negative synthetic scenarios on the real adapters",async()=>{
  const proof=await runWorkerRuntimeScenarios(worker);
  assert.equal(proof.normalCases,30);assert.equal(proof.negativeCases,15);assert.equal(proof.totalCases,45);
  assert.equal(proof.realProviderRequests,0);assert.equal(proof.realModelRequests,0);assert.equal(proof.awsCalls,0);
  assert.equal(proof.realDataCoverageClaimed,false);assert.equal(proof.remoteCancellationOrBillingAcceptanceClaimed,false);
  // Includes the four cancellation-ignoring cases; still no real network.
  assert.equal(proof.mockedProviderRequests,43);assert.equal(proof.mockedModelRequests,20);
});

test("an incomplete namespace fails before constructing a provider or claiming a runtime pass",async()=>{
  await assert.rejects(runWorkerRuntimeScenarios({}));
});
