import type { IncomingMessage } from "node:http";

const fail = () => Error("SYNTHETIC_READ_DENIAL_TRANSPORT_UNVERIFIED");

/** Bounded error envelopes only. A successful response is destroyed before any
 * data listener is attached. The enclosing transport owns the 20-second timer. */
export function readSyntheticDenialResponse(response: IncomingMessage, signal: AbortSignal) {
  return new Promise<{ status: number; body: string; errorType?: string }>((resolve, reject) => {
    let settled = false, size = 0, count = 0;
    const chunks: Buffer[] = [];
    const onAbort = () => finish();
    const finish = (value?: { status: number; body: string; errorType?: string }) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", onAbort);
      chunks.length = 0;
      if (value) resolve(value);
      else { response.destroy(); reject(fail()); }
    };
    // Keep an error listener even after destroy; no socket/body error may escape
    // as an unhandled error or expose a raw service message.
    response.on("error", () => finish());
    response.once("aborted", () => finish());
    response.once("close", () => { if (!settled) finish(); });
    const status = response.statusCode, declared = response.headers["content-length"];
    const errorType = response.headers["x-amzn-errortype"];
    const type = response.headers["content-type"]?.split(";")[0]?.trim().toLowerCase();
    if (signal.aborted || ![400, 403].includes(status ?? 0) || response.headers.location !== undefined ||
        !["application/json", "application/x-amz-json-1.1"].includes(type ?? "") ||
        declared !== undefined && (!/^\d+$/.test(declared) || Number(declared) > 16384) ||
        errorType !== undefined && (typeof errorType !== "string" || errorType.length > 256)) {
      finish(); return;
    }
    signal.addEventListener("abort", onAbort, { once: true });
    response.on("data", (chunk: Buffer) => {
      if (settled) return;
      if (!Buffer.isBuffer(chunk)) { finish(); return; }
      size += chunk.byteLength; count++;
      if (size > 16384 || count > 256 || signal.aborted) { finish(); return; }
      chunks.push(chunk);
    });
    response.once("end", () => {
      if (settled) return;
      try {
        if (signal.aborted || !response.complete || declared !== undefined && size !== Number(declared)) throw fail();
        const body = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(Buffer.concat(chunks));
        finish({ status: status!, body, ...(errorType === undefined ? {} : { errorType: errorType as string }) });
      } catch { finish(); }
    });
  });
}
