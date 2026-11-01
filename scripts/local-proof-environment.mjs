// Local build/test processes need OS bootstrap paths, not the operator's
// application settings. This is an environment boundary, not an OS sandbox:
// the existing account's readable files and executable search path still exist.
const OS_BOOTSTRAP_NAMES = new Set([
  "PATH", "PATHEXT", "SYSTEMROOT", "WINDIR", "COMSPEC", "SYSTEMDRIVE",
  "HOME", "USERPROFILE", "APPDATA", "LOCALAPPDATA", "TEMP", "TMP", "TMPDIR",
  "PROGRAMFILES", "PROGRAMFILES(X86)", "PROGRAMW6432", "COMMONPROGRAMFILES",
  "COMMONPROGRAMFILES(X86)", "COMMONPROGRAMW6432", "LANG", "LC_ALL", "LC_CTYPE", "TZ",
]);

export function cleanSourceChildEnvironment(source) {
  if (!source || typeof source !== "object" || Array.isArray(source)) throw new Error("LOCAL_PROOF_ENVIRONMENT_INVALID");
  const env = {}, names = new Map();
  for (const [name, value] of Object.entries(source)) {
    const folded = name.toUpperCase();
    if (!OS_BOOTSTRAP_NAMES.has(folded)) continue;
    if (typeof value !== "string" || value.length > 32768 || /[\0\r\n]/.test(value))
      throw new Error("LOCAL_PROOF_ENVIRONMENT_INVALID");
    if (names.has(folded)) {
      if (env[names.get(folded)] !== value) throw new Error("LOCAL_PROOF_ENVIRONMENT_INVALID");
      continue;
    }
    names.set(folded, name); env[name] = value;
  }
  return { ...env, AWS_EC2_METADATA_DISABLED: "true", AWS_MAX_ATTEMPTS: "1", AWS_PAGER: "", AWS_CLI_AUTO_PROMPT: "off",
    AWS_IGNORE_CONFIGURED_ENDPOINT_URLS: "true", NODE_DISABLE_COMPILE_CACHE: "1", NODE_TLS_REJECT_UNAUTHORIZED: "1" };
}
