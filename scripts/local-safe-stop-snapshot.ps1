$ErrorActionPreference='Stop'
try {
  $taskRoot=$env:GMAI_INVENTORY_ROOT
  $taskSelf=0
  $taskCallback=0
  if (-not $taskRoot -or -not [int]::TryParse($env:GMAI_INVENTORY_PID,[ref]$taskSelf) -or $taskSelf -le 0 -or
      -not [int]::TryParse($env:GMAI_INVENTORY_CALLBACK_PORT,[ref]$taskCallback) -or
      ($taskCallback -ne 0 -and ($taskCallback -lt 1024 -or $taskCallback -gt 65535))) { throw 'INVALID_SCOPE' }
  function Assert-TaskReadPath([string]$Path) {
    if (-not [IO.Path]::IsPathRooted($Path)) { throw 'INVALID_PATH' }
    $taskCurrent=$Path
    while($taskCurrent) {
      if (Test-Path -LiteralPath $taskCurrent) {
        $taskItem=Get-Item -LiteralPath $taskCurrent -Force
        if ($taskItem.Attributes.HasFlag([IO.FileAttributes]::ReparsePoint)) { throw 'REDIRECTED_PATH' }
      }
      $taskCurrent=[IO.Path]::GetDirectoryName($taskCurrent)
    }
  }
  function Get-TaskEntries([string]$Path) {
    Assert-TaskReadPath $Path
    if (-not (Test-Path -LiteralPath $Path)) { return @() }
    if (-not (Get-Item -LiteralPath $Path -Force).PSIsContainer) { throw 'NOT_DIRECTORY' }
    return @(Get-ChildItem -LiteralPath $Path -Force)
  }
  Assert-TaskReadPath $taskRoot
  if (-not (Get-Item -LiteralPath $taskRoot -Force).PSIsContainer) { throw 'INVALID_ROOT' }
  $taskCounts=[ordered]@{
    dockerProcesses=0;awsCliProcesses=0;projectHelperProcesses=0;unattributedHelperProcesses=0
    scopedListeners=0;ownedTempDirectories=0;backendStagingDirectories=0;frontendWorkDirectories=0
    loginCacheJsonFiles=0;dockerActiveSocketDirectories=0;assistantProcessesExcluded=0;retainedReviewDirectories=0;emptyWorkDirectoriesRetained=0
  }
  $taskProcesses=@(Get-CimInstance Win32_Process)
  if ($taskProcesses.Count -eq 0 -or $taskProcesses.Count -gt 10000) { throw 'INCOMPLETE_PROCESSES' }
  foreach($taskProcess in $taskProcesses) {
    if ($taskProcess.Name -match '^(Docker Desktop|com\.docker\.[a-z.-]+|dockerd|docker-proxy|docker|docker-desktop)\.exe$') { $taskCounts.dockerProcesses++;continue }
    if ($taskProcess.Name -eq 'aws.exe') { $taskCounts.awsCliProcesses++;continue }
    if ($taskProcess.Name -notin @('node.exe','esbuild.exe') -or $taskProcess.ProcessId -eq $taskSelf) { continue }
    $taskCommand=[string]$taskProcess.CommandLine
    if (-not $taskCommand) { $taskCounts.unattributedHelperProcesses++;continue }
    # These two host workers remain protected. This is a stated diagnostic
    # exclusion by script path, not an authorization or process-ownership proof.
    if ($taskCommand -match '\\+\.tmp[A-Za-z0-9]+\\+(?:kernel|trusted-worker)\.js(?:["''\s\\]|$)') { $taskCounts.assistantProcessesExcluded++;continue }
    if ($taskCommand.IndexOf($taskRoot,[StringComparison]::OrdinalIgnoreCase) -ge 0 -or
        $taskCommand -match '(?i)gmai-(?!review-)[A-Za-z0-9-]+') { $taskCounts.projectHelperProcesses++ }
    elseif ($taskCommand -match '(?:^|[ "''])(?:\.\.?[\\/])?(?:scripts|services|frontend|infrastructure|node_modules)[\\/]') {
      # Win32_Process exposes no working directory: do not call a relative
      # project-shaped command foreign/absent just because the root is missing.
      $taskCounts.unattributedHelperProcesses++
    }
  }
  $taskPorts=@(4173,4174,4175,5173,52257,49416)
  if ($taskCallback -ne 0) { $taskPorts+= $taskCallback }
  $taskConnections=@(Get-NetTCPConnection -State Listen)
  $taskCounts.scopedListeners=@($taskConnections | Where-Object { $_.LocalPort -in $taskPorts }).Count
  $taskTempRoots=@([IO.Path]::GetTempPath().TrimEnd('\'),(Join-Path $env:LOCALAPPDATA 'Temp')) | Select-Object -Unique
  foreach($taskTempRoot in $taskTempRoots) {
    foreach($taskEntry in @(Get-TaskEntries $taskTempRoot)) {
      if ($taskEntry.PSIsContainer -and $taskEntry.Name -like 'gmai-*') {
        if ($taskEntry.Name -like 'gmai-review-*') { $taskCounts.retainedReviewDirectories++ }
        else { $taskCounts.ownedTempDirectories++ }
      }
    }
  }
  foreach($taskService in @('services\controller','services\worker','services\operations\sweeper','services\operations\alarm_circuit')) {
    $taskCounts.backendStagingDirectories+=@(Get-TaskEntries (Join-Path $taskRoot ($taskService+'\bundle')) | Where-Object { $_.Name -like '.gmai-build-*' }).Count
  }
  foreach($taskWork in @('work','frontend\work')) {
    $taskPath=Join-Path $taskRoot $taskWork
    Assert-TaskReadPath $taskPath
    if (Test-Path -LiteralPath $taskPath) {
      if (@(Get-TaskEntries $taskPath).Count -eq 0) { $taskCounts.emptyWorkDirectoriesRetained++ }
      else { $taskCounts.frontendWorkDirectories++ }
    }
  }
  $taskCache=Join-Path $env:USERPROFILE '.aws\login\cache'
  $taskCounts.loginCacheJsonFiles=@(Get-TaskEntries $taskCache | Where-Object { $_.Name -like '*.json' }).Count
  foreach($taskSocket in @('Docker\run','docker-secrets-engine')) {
    $taskPath=Join-Path $env:LOCALAPPDATA $taskSocket
    Assert-TaskReadPath $taskPath
    if (Test-Path -LiteralPath $taskPath) { $taskCounts.dockerActiveSocketDirectories++ }
  }
  [pscustomobject]@{mode='windows-local-safe-stop-snapshot';schemaVersion=1;observedAtUtc=[DateTimeOffset]::UtcNow.ToString('o');
    processInventoryComplete=$true;networkInventoryComplete=$true;filesystemInventoryComplete=$true;authCacheInventoryComplete=$true;
    counts=$taskCounts} | ConvertTo-Json -Depth 3 -Compress
} catch {
  # Never expose raw command lines, paths, identifiers, cache content or errors.
  [pscustomobject]@{error='LOCAL_SAFE_STOP_SNAPSHOT_UNAVAILABLE';privateDetailsSuppressed=$true} | ConvertTo-Json -Compress
  exit 1
}
