import { acquireSyntheticRoleLease } from "./synthetic-role-acquisition.js";
import { createSyntheticReadDenialCandidate } from "./synthetic-read-denial.js";
import { createSyntheticReadDenialTransport } from "./synthetic-read-denial-transport.js";

const fail = () => Error("SYNTHETIC_READ_DENIAL_EXERCISE_UNVERIFIED");
type Factory = typeof createSyntheticReadDenialTransport;

/** Explicit, single-use candidate. Construction performs no AWS call. The
 * operator must first pass exact-source/cloud gates and own the temporary role.
 * Only the explicitly selected read-denial operator may invoke it live. It
 * never creates/deletes a role itself. */
export function createSyntheticReadDenialExercise(input: Parameters<typeof acquireSyntheticRoleLease>[0],
  factory: Factory = createSyntheticReadDenialTransport) {
  let started = false, closed = false;
  let lease: ReturnType<typeof acquireSyntheticRoleLease> | undefined;
  let candidate: ReturnType<typeof createSyntheticReadDenialCandidate> | undefined;
  function close() {
    if (closed) return;
    closed = true;
    let failed = false;
    for (const clean of [() => candidate?.close(), () => lease?.close()]) {
      try { clean(); } catch { failed = true; }
    }
    if (failed) throw fail();
  }
  async function run() {
    if (started || closed) throw fail();
    started = true;
    try {
      lease = acquireSyntheticRoleLease(input);
      const borrowed = lease.getCredentials();
      candidate = createSyntheticReadDenialCandidate({ nonce: input.nonce, lease,
        factory: credentials => factory(input.nonce, credentials) });
      const result = await candidate.run();
      if (result.requestAttempts !== 2 || result.acceptedCases.join(",") !== "parameter-canary,cluster-read" ||
          borrowed.accessKeyId !== "" || borrowed.secretAccessKey !== "" || borrowed.sessionToken !== "" || lease.remainingMs() !== 0) throw fail();
      let denied = false;
      try { lease.getCredentials(); } catch { denied = true; }
      if (!denied) throw fail();
      return { assumptionVerified: true, credentialLeaseClosed: true, acceptedCases: result.acceptedCases,
        requestAttempts: 2, inferenceCalls: 0, providerCalls: 0, liveAuthorizationVerified: false,
        serverSideExpiryVerified: false, rawDetailsSuppressed: true };
    } catch { throw fail(); }
    finally { close(); }
  }
  return { run, close, snapshot: () => ({ started, closed,
    requestAttempts: candidate?.snapshot().requestAttempts ?? 0 }) };
}
