import type { Plugin } from "vite";
export function summarizeEmittedModules(bundle: unknown, frontendRoot: string,
  packages: { name: string; version: string; license: string; directory: string }[]): object;
export function runtimeModuleMetadataPlugin(root?: string): Plugin;
export function verifyWrittenModuleChunks(root: string, chunks: { key: string; bytes: number; sha256: string }[]): void;
