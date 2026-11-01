import { isDeepStrictEqual } from "node:util";
import catalog from "../../../shared/asset_catalog/assets.json" with { type: "json" };

export const OWNER_OBSERVATION_HEALTH = Object.freeze({ status: "ok", circuit: "OPEN", jobCreationEnabled: false });
// The independent closing readiness read takes time. This is a dated read-only
// observation, not an authorization lease or assertion of current cloud state.
export const OWNER_OBSERVATION_MAX_AGE_MS = 180_000;
export interface ReadOnlyOwnerTransport {
  request(method: "GET", path: "v1/assets" | "v1/health"): Promise<Record<string, unknown>>;
}
export type OwnerObservation = {
  source: "aws-owner-read-only" | "local-test-fixture";
  observedAt: string;
  catalog: typeof catalog;
  health: typeof OWNER_OBSERVATION_HEALTH;
};

/** A fixed two-GET observation, not a general proxy. The caller supplies a
 * freshly verified owner transport. Never retain that transport in the server. */
export async function captureOwnerObservation(transport: ReadOnlyOwnerTransport,
  source: OwnerObservation["source"], now: () => number = Date.now): Promise<OwnerObservation> {
  if (!["aws-owner-read-only", "local-test-fixture"].includes(source)) throw Error("OWNER_OBSERVATION_SOURCE_INVALID");
  let timer: ReturnType<typeof setTimeout> | undefined, expired = false;
  const deadline = new Promise<never>((_, reject) => { timer = setTimeout(() => {
    expired = true; reject(Error("OWNER_OBSERVATION_UNAVAILABLE"));
  }, 21_000); });
  try {
    return await Promise.race([deadline, (async () => {
      const assets = await transport.request("GET", "v1/assets");
      if (expired || !isDeepStrictEqual(assets, catalog)) throw Error("OWNER_OBSERVATION_UNAVAILABLE");
      const health = await transport.request("GET", "v1/health");
      if (expired || !isDeepStrictEqual(health, OWNER_OBSERVATION_HEALTH)) throw Error("OWNER_OBSERVATION_UNAVAILABLE");
      const at = now();
      if (!Number.isSafeInteger(at) || at < 0) throw Error("OWNER_OBSERVATION_UNAVAILABLE");
      return { source, observedAt: new Date(at).toISOString(), catalog: structuredClone(catalog), health: { ...OWNER_OBSERVATION_HEALTH } };
    })()]);
  } catch { throw Error("OWNER_OBSERVATION_UNAVAILABLE"); }
  finally { if (timer) clearTimeout(timer); }
}

/** Revalidate and copy before any socket is opened; reject private extra fields. */
export function validateOwnerObservation(value: OwnerObservation, now = Date.now()): OwnerObservation {
  const at = Date.parse(value?.observedAt);
  if (!Number.isSafeInteger(now) || !Number.isFinite(at) || at > now || now - at > OWNER_OBSERVATION_MAX_AGE_MS ||
      new Date(at).toISOString() !== value.observedAt ||
      !["aws-owner-read-only", "local-test-fixture"].includes(value.source) ||
      !isDeepStrictEqual(Object.keys(value).sort(), ["catalog", "health", "observedAt", "source"]) ||
      !isDeepStrictEqual(value.catalog, catalog) || !isDeepStrictEqual(value.health, OWNER_OBSERVATION_HEALTH)) {
    throw Error("OWNER_OBSERVATION_INVALID");
  }
  return structuredClone(value);
}
