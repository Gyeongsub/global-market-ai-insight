param([switch]$ExecuteStoppedSocketBackup)

# Project-local workaround only. It never resets Desktop, changes settings,
# kills processes, follows socket targets, or touches images/volumes/data-root.
$ErrorActionPreference = 'Stop'
$taskMoved = 0
$taskScope = [guid]::NewGuid().ToString('N')
if (-not $ExecuteStoppedSocketBackup) {
  [pscustomobject]@{mode='dry-run';cloudCalls=0;dockerCalls=0;directoryMoves=0;processStops=0;filesDeleted=0;globalSettingsChanged=$false;futureTransientDirectoriesMax=2} | ConvertTo-Json -Compress
  exit 0
}

function Assert-TaskDockerStopped {
  if (Get-Process -Name 'Docker Desktop','com.docker.backend' -ErrorAction SilentlyContinue) { throw 'DOCKER_PREFLIGHT_NOT_STOPPED' }
}
function Assert-TaskSocketDirectory($taskSource,$taskExpectedParent,$taskNames) {
  $taskItem = Get-Item -LiteralPath $taskSource -Force
  if (-not $taskItem.PSIsContainer -or $taskItem.Attributes.HasFlag([IO.FileAttributes]::ReparsePoint) -or
      (Resolve-Path -LiteralPath $taskSource).Path -cne $taskSource -or
      [IO.Path]::GetFullPath($taskSource) -cne $taskSource -or
      (Split-Path -Parent $taskSource) -cne $taskExpectedParent) { throw 'DOCKER_PREFLIGHT_PATH_INVALID' }
  $taskParentItem = Get-Item -LiteralPath $taskExpectedParent -Force
  if (-not $taskParentItem.PSIsContainer -or $taskParentItem.Attributes.HasFlag([IO.FileAttributes]::ReparsePoint)) { throw 'DOCKER_PREFLIGHT_PATH_INVALID' }
  $taskEntries = @(Get-ChildItem -LiteralPath $taskSource -Force)
  if ($taskEntries.Count -gt $taskNames.Count) { throw 'DOCKER_PREFLIGHT_CONTENT_UNEXPECTED' }
  foreach ($taskEntry in $taskEntries) {
    if ($taskNames -cnotcontains $taskEntry.Name -or $taskEntry.PSIsContainer -or $taskEntry.Length -ne 0 -or
        -not $taskEntry.Attributes.HasFlag([IO.FileAttributes]::ReparsePoint)) { throw 'DOCKER_PREFLIGHT_CONTENT_UNEXPECTED' }
  }
  return $taskEntries.Count
}

try {
  Assert-TaskDockerStopped
  $taskLocal = [Environment]::GetFolderPath('LocalApplicationData')
  if (-not [IO.Path]::IsPathRooted($taskLocal) -or (Resolve-Path -LiteralPath $taskLocal).Path -cne $taskLocal -or
      (Get-Item -LiteralPath $taskLocal).Attributes.HasFlag([IO.FileAttributes]::ReparsePoint)) { throw 'DOCKER_PREFLIGHT_PATH_INVALID' }
  $taskPlans = @(
    @{Source=(Join-Path $taskLocal 'Docker\run');Parent=(Join-Path $taskLocal 'Docker');Names=@('dockerEthernetVfkit','dockerInference','userAnalyticsOtlpHttp.sock')},
    @{Source=(Join-Path $taskLocal 'docker-secrets-engine');Parent=$taskLocal;Names=@('engine.sock')}
  )
  foreach ($taskPlan in $taskPlans) {
    if (Test-Path -LiteralPath $taskPlan.Source) {
      $taskPlan.Entries = Assert-TaskSocketDirectory $taskPlan.Source $taskPlan.Parent $taskPlan.Names
      $taskPlan.Destination = $taskPlan.Source + '.stale-gmai-' + $taskScope
      if ([IO.Path]::GetFullPath($taskPlan.Destination) -cne $taskPlan.Destination -or
          (Split-Path -Parent $taskPlan.Destination) -cne $taskPlan.Parent -or (Test-Path -LiteralPath $taskPlan.Destination)) { throw 'DOCKER_PREFLIGHT_DESTINATION_INVALID' }
    }
  }
  foreach ($taskPlan in $taskPlans) {
    if ($null -ne $taskPlan.Destination) {
      Assert-TaskDockerStopped
      $taskCurrentEntries = Assert-TaskSocketDirectory $taskPlan.Source $taskPlan.Parent $taskPlan.Names
      if ($taskCurrentEntries -ne $taskPlan.Entries) { throw 'DOCKER_PREFLIGHT_CONTENT_CHANGED' }
      Move-Item -LiteralPath $taskPlan.Source -Destination $taskPlan.Destination -ErrorAction Stop
      $taskMoved++
      if ((Test-Path -LiteralPath $taskPlan.Source) -or -not (Test-Path -LiteralPath $taskPlan.Destination)) { throw 'DOCKER_PREFLIGHT_MOVE_UNVERIFIED' }
    }
  }
  [pscustomobject]@{mode='stopped-transient-socket-backup';completed=$true;recoverableDirectories=$taskMoved;backupScope=$taskScope;
    cloudCalls=0;dockerCalls=0;processStops=0;filesDeleted=0;globalSettingsChanged=$false;imagesAndVolumesModified=$false;permanentUpstreamFixClaimed=$false} | ConvertTo-Json -Compress
} catch {
  $taskCode = if ($_.Exception.Message -cmatch '^DOCKER_PREFLIGHT_[A-Z_]+$') { $_.Exception.Message } else { 'DOCKER_PREFLIGHT_UNVERIFIED' }
  [pscustomobject]@{error=$taskCode;recoverableDirectories=$taskMoved;backupScope=$taskScope;privateDetailsSuppressed=$true;filesDeleted=0;imagesAndVolumesModified=$false} | ConvertTo-Json -Compress
  exit 1
}
