import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { sanitizeSocialImageFile } from "./sanitize-social-image.mjs";
import { writeFrontendAttribution } from "../../scripts/runtime-attribution.mjs";
import { collectFrontendAttribution } from "../../scripts/frontend-helper-attribution.mjs";
import { frontendCompilerChildEnvironment } from "./compiler-environment.mjs";

export async function buildFrontend() {
  const env=frontendCompilerChildEnvironment();
  const frontendRoot = dirname(dirname(fileURLToPath(import.meta.url)));
  const viteCli = join(frontendRoot, "node_modules", "vite", "bin", "vite.js");
  // Missing/mismatched license inputs fail before replacing the prior build.
  const attribution = await collectFrontendAttribution(dirname(frontendRoot));
  const result = spawnSync(process.execPath, [viteCli, "build"], {
    cwd: frontendRoot,
    stdio: "inherit",
    env,
    windowsHide: true,
  });

  if (result.status !== 0 || result.signal !== null || result.error) throw Error("FRONTEND_BUILD_UNVERIFIED");
  const socialImage = sanitizeSocialImageFile(join(frontendRoot, "dist", "og.png"));
  console.log(`[build] social image metadata removed from dist only: ${socialImage.removedBytes} bytes`);
  const notices = writeFrontendAttribution(dirname(frontendRoot), attribution);
  console.log(`[build] runtime notices included for ${notices.runtimePackages} locked packages and ${attribution.report.buildHelperProducers.producerPackages} build-helper producers`);
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  try{if(process.argv.length!==2)throw Error("FRONTEND_BUILD_ARGUMENTS_REJECTED");await buildFrontend();}
  catch{console.error(JSON.stringify({error:"FRONTEND_BUILD_UNVERIFIED",rawDetailsSuppressed:true}));process.exitCode=1;}
}
