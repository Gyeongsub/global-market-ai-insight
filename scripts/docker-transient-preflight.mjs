import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export function dockerTransientRecoveryPlan(args = []) {
  if (args.length) throw Error('DOCKER_PREFLIGHT_ARGUMENTS_REJECTED');
  return {mode:'dry-run',cloudCalls:0,dockerCalls:0,directoryMoves:0,processStops:0,filesDeleted:0,globalSettingsChanged:false,futureTransientDirectoriesMax:2};
}
export function backupStoppedDockerSockets() {
  if (process.platform !== 'win32') throw Error('DOCKER_PREFLIGHT_PLATFORM_UNSUPPORTED');
  const file = join(dirname(fileURLToPath(import.meta.url)), 'docker-transient-preflight.ps1');
  if (!lstatSync(file).isFile() || lstatSync(file).isSymbolicLink() || realpathSync(file) !== file || lstatSync(file).size > 16_000) throw Error('DOCKER_PREFLIGHT_SOURCE_INVALID');
  const source = readFileSync(file, 'utf8'), env = {...process.env};
  for (const key of Object.keys(env)) if (/^(AWS_|GMAI_|CDK_|OPENAI_|ANTHROPIC_|TWELVE_?DATA|BEDROCK_|GH_TOKEN$|GITHUB_TOKEN$|NODE_OPTIONS$|NODE_PATH$|PSModulePath$)/i.test(key)) delete env[key];
  if (typeof env.SystemRoot !== 'string' || !/^[A-Za-z]:\\Windows$/i.test(env.SystemRoot)) throw Error('DOCKER_PREFLIGHT_HOST_UNVERIFIED');
  const host = join(env.SystemRoot,'System32','WindowsPowerShell','v1.0','powershell.exe');
  env.PSModulePath = join(env.SystemRoot,'System32','WindowsPowerShell','v1.0','Modules');
  // Execute the trusted local automation as normal inline commands. No policy,
  // registry setting or unsigned external/downloaded script is changed/run.
  const result = spawnSync(host,['-NoLogo','-NoProfile','-NonInteractive','-Command',`& {\n${source}\n} -ExecuteStoppedSocketBackup`],
    {env,encoding:'utf8',windowsHide:true,timeout:15000,maxBuffer:30000});
  const packet = JSON.parse(result.stdout);
  if (result.status !== 0 || result.signal !== null || packet.completed !== true || packet.filesDeleted !== 0 || packet.imagesAndVolumesModified !== false ||
    !Number.isSafeInteger(packet.recoverableDirectories) || packet.recoverableDirectories > 2) throw Error('DOCKER_PREFLIGHT_RECOVERY_UNVERIFIED');
  return {...packet,sourceSha256:createHash('sha256').update(source).digest('hex'),executionPolicyChanged:false};
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {const args=process.argv.slice(2);if (!args.length) console.log(JSON.stringify(dockerTransientRecoveryPlan()));
    else {if(args.length!==1||args[0]!=='--execute-stopped-socket-backup')throw Error('DOCKER_PREFLIGHT_ARGUMENTS_REJECTED');console.log(JSON.stringify(backupStoppedDockerSockets()));}}
  catch(error){console.error(JSON.stringify({error:error instanceof Error&&/^DOCKER_PREFLIGHT_[A-Z_]+$/.test(error.message)?error.message:'DOCKER_PREFLIGHT_UNVERIFIED',privateDetailsSuppressed:true,noDestructiveFallback:true}));process.exitCode=1;}
}
