import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { runtimeNoticesPlugin } from "./scripts/runtime-notices-plugin.mjs";
import { runtimeModuleMetadataPlugin } from "./scripts/runtime-module-metadata-plugin.mjs";
import { fileURLToPath } from "node:url";
import { FIXTURE_PREVIEW_HEADERS } from "../shared/fixture-response-policy.mjs";
import { assertNodeSecurityBaseline } from "../scripts/node-security-baseline.mjs";

assertNodeSecurityBaseline();

export default defineConfig({
  // Synthetic fixtures require no client credentials or deployment settings.
  // Do not load dotenv files or expose generic inherited VITE_* values.
  envDir: false,
  envPrefix: [],
  plugins: [react(), runtimeNoticesPlugin(), runtimeModuleMetadataPlugin()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: false,
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    // Do not implicitly forward browser runtime events into an agent terminal.
    forwardConsole: false,
    fs: {
      strict: true,
      // The dev UI needs its own source and public dependency code, not the
      // project's infrastructure, evidence or private assistant/cloud state.
      allow: [fileURLToPath(new URL(".", import.meta.url)), fileURLToPath(new URL("../node_modules/.pnpm", import.meta.url))],
      deny: [".env", ".env.*", ".npmrc", ".yarnrc.yml", "**/.git/**", "**/.aws/**", "**/.codex/**", "**/.agents/**",
        "**/*.{crt,pem,key,p12,pfx,cer,der}", "**/outputs/**", "**/work/**", "**/cdk.out/**", "**/*.tfstate*"],
    },
  },
  preview: { host: "127.0.0.1", port: 4173, strictPort: true, headers: {...FIXTURE_PREVIEW_HEADERS} },
});
