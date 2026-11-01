import assert from "node:assert/strict";
import test from "node:test";
import type { JobRecord } from "../../controller/src/contracts.js";
import { createQueuedJob, transitionJob } from "../../controller/src/job.js";
import type { AnalysisResult } from "../src/analysis.js";
import { MarketDataProviderError } from "../src/providers/market-data-provider.js";
import { JobRepositoryError, type JobRepository, type WorkerJobTransition } from "../src/repositories/job-repository.js";
import { runOneShotWorker, WorkerLifecycleError } from "../src/worker-lifecycle.js";

function queued(deadlineAt?: string) {
  const job = createQueuedJob({
    request: { operation: "PRICE", symbol: "VOO", locale: "en" },
    idempotencyKey: "00000000-0000-4000-8000-000000000000",
    jobId: "01J00000000000000000000000",
    now: new Date("2026-08-23T00:00:00.000Z"),
    timeoutSeconds: 90,
    ttlSeconds: 86_400,
  });
  return deadlineAt ? { ...job, deadlineAt } : job;
}

class MemoryRepository implements JobRepository {
  transitions: WorkerJobTransition[] = [];
  constructor(public job: JobRecord | null) {}
  async load(_jobId: string) { return this.job; }
  async transition(input: WorkerJobTransition) {
    this.transitions.push(input);
    const next = transitionJob(input.current, input.next, input.now);
    this.job = input.next === "SUCCEEDED"
      ? { ...next, result: input.result }
      : input.next === "FAILED" || input.next === "TIMED_OUT"
        ? { ...next, errorCode: input.errorCode, errorMessage: input.errorMessage }
        : next;
    return this.job;
  }
}

const analysisEngine = { async analyze() { throw new Error("PRICE must not call analysis"); } };

test("claims once, executes once, and conditionally completes the job", async () => {
  const repository = new MemoryRepository(queued());
  let providerCalls = 0;
  const marketDataProvider = {
    async getQuote() {
      providerCalls += 1;
      return {
        symbol: "VOO",
        price: 500,
        currency: "USD",
        marketTimestamp: "2026-08-22T20:00:00Z",
        retrievedAt: "2026-08-23T00:00:00Z",
        marketState: "CLOSED",
        freshness: "LATEST_AVAILABLE",
        source: "mock-provider",
      };
    },
  } as const;
  const times = [new Date("2026-08-23T00:00:01.000Z"), new Date("2026-08-23T00:00:02.000Z")];
  const completed = await runOneShotWorker(queued().jobId, {
    repository,
    marketDataProvider,
    analysisEngine,
    now: () => times.shift() ?? new Date("2026-08-23T00:00:03.000Z"),
  });

  assert.equal(providerCalls, 1);
  assert.deepEqual(repository.transitions.map(({ next }) => next), ["RUNNING", "SUCCEEDED"]);
  assert.equal(completed.status, "SUCCEEDED");
  assert.equal(completed.version, 3);
  assert.equal(completed.attemptCount, 1);
  assert.equal((completed.result as { kind: string }).kind, "PRICE");
});

test("rejects duplicate and expired claims before any external call", async () => {
  let providerCalls = 0;
  const marketDataProvider = { async getQuote() { providerCalls += 1; throw new Error("must not run"); } };
  const runningRepository = new MemoryRepository(transitionJob(queued(), "RUNNING", new Date("2026-08-23T00:00:01.000Z")));
  await assert.rejects(
    runOneShotWorker(queued().jobId, { repository: runningRepository, marketDataProvider, analysisEngine }),
    (error: unknown) => error instanceof WorkerLifecycleError && error.code === "JOB_NOT_CLAIMABLE",
  );

  const expiredRepository = new MemoryRepository(queued("2026-08-22T23:59:59.000Z"));
  await assert.rejects(
    runOneShotWorker(queued().jobId, {
      repository: expiredRepository,
      marketDataProvider,
      analysisEngine,
      now: () => new Date("2026-08-23T00:00:01.000Z"),
    }),
    (error: unknown) => error instanceof WorkerLifecycleError && error.code === "JOB_DEADLINE_EXCEEDED",
  );
  assert.equal(providerCalls, 0);
  assert.deepEqual(expiredRepository.transitions.map(({ next }) => next), ["TIMED_OUT"]);
});

test("persists only a sanitized stable failure", async () => {
  const repository = new MemoryRepository(queued());
  const marketDataProvider = {
    async getQuote() {
      throw new MarketDataProviderError("PROVIDER_ERROR", "secret provider response body", false);
    },
  };
  await assert.rejects(
    runOneShotWorker(queued().jobId, {
      repository,
      marketDataProvider,
      analysisEngine,
      now: () => new Date("2026-08-23T00:00:01.000Z"),
    }),
    (error: unknown) => error instanceof WorkerLifecycleError && error.code === "PROVIDER_ERROR" && !error.message.includes("secret"),
  );
  assert.deepEqual(repository.transitions.map(({ next }) => next), ["RUNNING", "FAILED"]);
  assert.equal(repository.job?.errorCode, "PROVIDER_ERROR");
  assert.equal(repository.job?.errorMessage, "Market data provider request failed.");
});

test("invalid analysis is marked FAILED without persisting model content", async () => {
  const request = { operation: "ANALYZE", symbol: "VOO", locale: "en" } as const;
  const job = createQueuedJob({
    request, idempotencyKey: "00000000-0000-4000-8000-000000000001",
    jobId: "01J00000000000000000000001", now: new Date("2026-08-23T00:00:00.000Z"),
    timeoutSeconds: 90, ttlSeconds: 86_400,
  });
  const repository = new MemoryRepository(job);
  const marketDataProvider = { async getQuote() { return {
    symbol: "VOO", price: 500, currency: "USD",
    marketTimestamp: "2026-08-22T20:00:00Z", retrievedAt: "2026-08-23T00:00:00Z",
    marketState: "CLOSED", freshness: "LATEST_AVAILABLE", source: "mock-provider",
  }; } } as const;
  const malformed = { kind: "ANALYSIS", symbol: "VOO", locale: "en", summary: "private model content" } as unknown as AnalysisResult;
  const invalidEngine = { async analyze() { return { result: malformed, usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 } }; } };
  await assert.rejects(
    runOneShotWorker(job.jobId, { repository, marketDataProvider, analysisEngine: invalidEngine, now: () => new Date("2026-08-23T00:00:01.000Z") }),
    (error: unknown) => error instanceof WorkerLifecycleError && error.code === "INTERNAL_ERROR" && !error.message.includes("private"),
  );
  assert.deepEqual(repository.transitions.map(({ next }) => next), ["RUNNING", "FAILED"]);
  assert.equal(repository.job?.errorCode, "INTERNAL_ERROR");
  assert.equal(repository.job?.result, undefined);
});

test("does not overwrite a concurrent terminal state when completion conflicts", async () => {
  const base = new MemoryRepository(queued());
  const repository: JobRepository = {
    load: (jobId) => base.load(jobId),
    async transition(input) {
      if (input.next === "SUCCEEDED") throw new JobRepositoryError("CONDITIONAL_CONFLICT", "internal conflict");
      return base.transition(input);
    },
  };
  const marketDataProvider = {
    async getQuote() {
      return {
        symbol: "VOO", price: 500, currency: "USD",
        marketTimestamp: "2026-08-22T20:00:00Z", retrievedAt: "2026-08-23T00:00:00Z",
        marketState: "CLOSED", freshness: "LATEST_AVAILABLE", source: "mock-provider",
      };
    },
  } as const;
  await assert.rejects(
    runOneShotWorker(queued().jobId, { repository, marketDataProvider, analysisEngine, now: () => new Date("2026-08-23T00:00:01.000Z") }),
    (error: unknown) => error instanceof WorkerLifecycleError && error.code === "JOB_STATE_CONFLICT",
  );
  assert.deepEqual(base.transitions.map(({ next }) => next), ["RUNNING"]);
});

test("surfaces only an allowlisted repository diagnostic category", async () => {
  const repository: JobRepository = {
    async load() {
      throw new JobRepositoryError("REPOSITORY_CREDENTIALS_ERROR", "Job repository credentials were unavailable or invalid.");
    },
    async transition() {
      throw new Error("must not transition");
    },
  };
  await assert.rejects(
    runOneShotWorker(queued().jobId, { repository, marketDataProvider: { async getQuote() { throw new Error("must not call provider"); } }, analysisEngine }),
    (error: unknown) => error instanceof WorkerLifecycleError
      && error.code === "INTERNAL_ERROR"
      && error.diagnosticCategory === "REPOSITORY_CREDENTIALS_ERROR"
      && !error.message.toLowerCase().includes("credential"),
  );
});

for (const stage of ["claim", "provider-price", "provider-analyze", "model"] as const) {
  test(`job deadline is rechecked after ${stage} without a late paid stage or success`, async () => {
    let clock = new Date("2026-08-23T00:01:29.000Z");
    const job = { ...queued(), operation: stage === "provider-analyze" || stage === "model" ? "ANALYZE" : "PRICE" } as JobRecord;
    const base = new MemoryRepository(job);
    const repository: JobRepository = {
      load: (id) => base.load(id),
      async transition(input) {
        const result = await base.transition(input);
        if (stage === "claim" && input.next === "RUNNING") clock = new Date(job.deadlineAt);
        return result;
      },
    };
    let providerCalls = 0;
    let modelCalls = 0;
    await assert.rejects(runOneShotWorker(job.jobId, {
      repository,
      now: () => clock,
      marketDataProvider: { async getQuote() {
        providerCalls += 1;
        if (stage.startsWith("provider")) clock = new Date(job.deadlineAt);
        return {
          symbol: "VOO", price: 500, currency: "USD",
          marketTimestamp: "2026-08-22T20:00:00Z", retrievedAt: "2026-08-23T00:00:00Z",
          marketState: "CLOSED", freshness: "LATEST_AVAILABLE", source: "mock-provider",
        };
      } },
      analysisEngine: { async analyze() {
        modelCalls += 1;
        clock = new Date(job.deadlineAt);
        return { result: { private: "late model content" } as unknown as AnalysisResult, usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 } };
      } },
    }), (error: unknown) => error instanceof WorkerLifecycleError && error.code === "JOB_DEADLINE_EXCEEDED" && !error.message.includes("private"));
    assert.equal(providerCalls, stage === "claim" ? 0 : 1);
    assert.equal(modelCalls, stage === "model" ? 1 : 0);
    assert.deepEqual(base.transitions.map(({ next }) => next), ["RUNNING", "TIMED_OUT"]);
    assert.equal(base.job?.errorCode, "JOB_DEADLINE_EXCEEDED");
    assert.equal(base.job?.result, undefined);
  });
}

test("an expired provider failure is timed out without copying provider error text", async () => {
  let clock = new Date("2026-08-23T00:01:29.000Z");
  const repository = new MemoryRepository(queued());
  await assert.rejects(runOneShotWorker(queued().jobId, {
    repository, now: () => clock, analysisEngine,
    marketDataProvider: { async getQuote(): Promise<never> {
      clock = new Date(queued().deadlineAt);
      throw new MarketDataProviderError("PROVIDER_ERROR", "private late response", true);
    } },
  }), (error: unknown) => error instanceof WorkerLifecycleError && error.code === "JOB_DEADLINE_EXCEEDED" && !error.message.includes("private"));
  assert.deepEqual(repository.transitions.map(({ next }) => next), ["RUNNING", "TIMED_OUT"]);
  assert.equal(repository.job?.result, undefined);
});

test("a concurrent sweeper terminal state is not overwritten by the worker timeout", async () => {
  const base = new MemoryRepository(queued());
  let clock = new Date("2026-08-23T00:01:29.000Z");
  const repository: JobRepository = {
    load: (id) => base.load(id),
    async transition(input) {
      if (input.next === "TIMED_OUT") throw new JobRepositoryError("CONDITIONAL_CONFLICT", "private concurrent state");
      const running = await base.transition(input);
      clock = new Date(queued().deadlineAt);
      return running;
    },
  };
  await assert.rejects(runOneShotWorker(queued().jobId, {
    repository, now: () => clock, analysisEngine,
    marketDataProvider: { async getQuote(): Promise<never> { throw new Error("must not reach provider"); } },
  }), (error: unknown) => error instanceof WorkerLifecycleError && error.code === "JOB_STATE_CONFLICT" && error.diagnosticCategory === "REPOSITORY_STATE_CONFLICT");
  assert.deepEqual(base.transitions.map(({ next }) => next), ["RUNNING"]);
});

test("invalid clock or stored deadline never starts a provider operation", async () => {
  let providerCalls = 0;
  const marketDataProvider = { async getQuote(): Promise<never> { providerCalls += 1; throw new Error("must not call"); } };
  for (const [job, clock] of [
    [queued(), new Date(Number.NaN)],
    [{ ...queued(), deadlineAt: "invalid" }, new Date("2026-08-23T00:00:01Z")],
  ] as const) {
    const repository = new MemoryRepository(job);
    await assert.rejects(runOneShotWorker(job.jobId, { repository, now: () => clock, analysisEngine, marketDataProvider }),
      (error: unknown) => error instanceof WorkerLifecycleError && error.code === "INTERNAL_ERROR");
    assert.equal(repository.transitions.length, 0);
  }
  assert.equal(providerCalls, 0);
});
