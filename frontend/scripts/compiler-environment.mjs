import { cleanSourceChildEnvironment } from "../../scripts/local-proof-environment.mjs";
import { assertNodeSecurityBaseline } from "../../scripts/node-security-baseline.mjs";

// The supported frontend commands reject alternate native/wasm selection before
// starting Vite. This cannot undo NODE_OPTIONS already applied to the parent,
// authenticate all installed tools, or sandbox readable local files/PATH.
export function frontendCompilerChildEnvironment(source=process.env) {
  assertNodeSecurityBaseline();
  if(!source||typeof source!=="object"||Array.isArray(source)||Object.keys(source).some(name=>
    /^(?:NAPI_RS_|ROLLDOWN_|ESBUILD_|npm_config_esbuild_)/i.test(name)&&source[name]!==undefined&&source[name]!==""))
    throw Error("FRONTEND_COMPILER_ENVIRONMENT_REJECTED");
  return {...cleanSourceChildEnvironment(source),NAPI_RS_ENFORCE_VERSION_CHECK:"1"};
}
