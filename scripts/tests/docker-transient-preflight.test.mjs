import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { dockerTransientRecoveryPlan } from '../docker-transient-preflight.mjs';
const file = resolve('scripts/docker-transient-preflight.ps1');
test('Docker transient workaround is a zero-action plan by default without changing host script policy', () => {
  const result = spawnSync(process.execPath, [resolve('scripts/docker-transient-preflight.mjs')], { encoding:'utf8', windowsHide:true, timeout:10000 });
  assert.equal(result.status, 0); const plan = JSON.parse(result.stdout);
  assert.equal(plan.mode, 'dry-run');
  for (const key of ['cloudCalls','dockerCalls','directoryMoves','processStops','filesDeleted']) assert.equal(plan[key], 0);
  assert.equal(plan.globalSettingsChanged, false); assert.equal(plan.futureTransientDirectoriesMax, 2);
  assert.throws(() => dockerTransientRecoveryPlan(['--reset']));
});
test('workaround source permits only recoverable exact transient moves, not destructive reset/diagnostics', () => {
  const source = readFileSync(file, 'utf8');
  assert.equal(/Remove-Item|Stop-Process|Start-Process|\b-Recurse\b|gather -upload|factory-reset|Set-ExecutionPolicy|wsl --shutdown/.test(source), false);
  assert.match(source, /Assert-TaskDockerStopped/); assert.match(source, /ReparsePoint/);
  assert.match(source, /dockerInference/); assert.match(source, /engine\.sock/);
  assert.match(source, /Move-Item -LiteralPath \$taskPlan\.Source -Destination \$taskPlan\.Destination/);
  assert.match(source, /permanentUpstreamFixClaimed=\$false/);
});
