import { BedrockRuntimeClient } from "@aws-sdk/client-bedrock-runtime";
import { AwsBedrockConverseTransport } from "../../worker/src/providers/aws-bedrock-converse-transport.js";
import type { BedrockConverseTransport } from "../../worker/src/providers/bedrock-analysis-adapter.js";
import { createSyntheticAnalysisSession, SYNTHETIC_LAB } from "./synthetic-analysis.js";
import type { acquireSyntheticRoleLease } from "./synthetic-role-acquisition.js";

type Lease = ReturnType<typeof acquireSyntheticRoleLease>;
type Factory = (credentials: () => ReturnType<Lease["getCredentials"]>) => {
  transport: BedrockConverseTransport; destroy: () => void;
};
function defaultFactory(credentials: Parameters<Factory>[0]) {
  const client = new BedrockRuntimeClient({ region: SYNTHETIC_LAB.region,
    endpoint: "https://bedrock-runtime.ap-northeast-1.amazonaws.com", maxAttempts: 1,
    credentials: async () => credentials(), requestHandler: { connectionTimeout: 5000, requestTimeout: 20000 } });
  return { transport: new AwsBedrockConverseTransport({ region: SYNTHETIC_LAB.region, client }), destroy: () => client.destroy() };
}

/** Restricted composition used by the gated temporary browser lifecycle. The parent
 * must enforce runtime/source/cloud gates, and close this on server end/failure.
 * No administrator credential or default credential provider reaches the SDK. */
export function createRestrictedSyntheticRuntime(lease: Lease, factory: Factory = defaultFactory) {
  let client: ReturnType<Factory> | undefined, session: ReturnType<typeof createSyntheticAnalysisSession> | undefined, closed = false;
  function close() {
    if (closed) return;
    closed = true;
    let failed = false;
    for (const cleanup of [() => session?.close(), () => lease.close(), () => client?.destroy()]) {
      try { cleanup(); } catch { failed = true; }
    }
    if (failed) throw Error("SYNTHETIC_RESTRICTED_CLOSE_UNVERIFIED");
  }
  try {
    if (lease.remainingMs() <= 0) throw Error();
    client = factory(() => lease.getCredentials());
    const lifetimeMs = lease.remainingMs();
    if (lifetimeMs <= 0 || lifetimeMs > SYNTHETIC_LAB.lifetimeMs) throw Error();
    session = createSyntheticAnalysisSession({ async converse(request, options) {
      // Check each application call even if the SDK caches a provider result.
      lease.getCredentials();
      return client!.transport.converse(request, options);
    } }, { lifetimeMs });
    return { session, close };
  } catch {
    try { close(); } catch { /* sanitize cleanup exceptions too */ }
    throw Error("SYNTHETIC_RESTRICTED_RUNTIME_REJECTED");
  }
}
