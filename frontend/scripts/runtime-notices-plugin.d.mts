import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";

export function serveRuntimeNotices(request: Pick<IncomingMessage, "url" | "method">,
  response: ServerResponse, next: () => void, text: string): void;
export function runtimeNoticesPlugin(root?: string): Plugin;
export function rejectPrivateLocalRequests(request: Pick<IncomingMessage, "url">,
  response: ServerResponse, next: () => void): void;
export function assertLocalPublicAssetBoundary(root: string): void;
