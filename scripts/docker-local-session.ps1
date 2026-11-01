param(
  [ValidateSet('plan','inspect-stopped','start-hidden','verify-owner','find-owned-start','verify-stopped')][string]$Action='plan',
  [int]$ExpectedRootPid=0,
  [int]$ExpectedParentPid=0,
  [string]$ExpectedStartedAt='',
  [string]$ExpectedAfterUtc=''
)

$ErrorActionPreference='Stop'
if ($Action -eq 'plan') {
  [pscustomobject]@{mode='dry-run';processReads=0;processStarts=0;processStops=0;filesDeleted=0;settingsChanged=$false} | ConvertTo-Json -Compress
  exit 0
}
function Get-TaskDockerProcesses {
  return @(Get-CimInstance Win32_Process | Where-Object { $_.Name -match '^(Docker Desktop|com\.docker\.[a-z.-]+|dockerd|docker-proxy)\.exe$' })
}
function Get-TaskDockerInstall {
  $taskLocal=[Environment]::GetFolderPath('LocalApplicationData')
  $taskBase=Join-Path $taskLocal 'Programs\DockerDesktop'
  $taskCli=Join-Path $taskBase 'resources\bin\docker.exe'
  $taskDesktop=Join-Path $taskBase 'Docker Desktop.exe'
  $taskStopPlugin=Join-Path $taskBase 'resources\cli-plugins\docker-desktop.exe'
  foreach($taskDirectory in @($taskLocal,(Join-Path $taskLocal 'Programs'),$taskBase,(Join-Path $taskBase 'resources'),(Join-Path $taskBase 'resources\bin'),(Join-Path $taskBase 'resources\cli-plugins'))) {
    $taskItem=Get-Item -LiteralPath $taskDirectory -Force
    if (-not $taskItem.PSIsContainer -or $taskItem.Attributes.HasFlag([IO.FileAttributes]::ReparsePoint) -or
        (Resolve-Path -LiteralPath $taskDirectory).Path -cne $taskDirectory) {throw 'DOCKER_LOCAL_INSTALL_INVALID'}
  }
  foreach($taskFile in @($taskCli,$taskDesktop,$taskStopPlugin)) {
    $taskItem=Get-Item -LiteralPath $taskFile -Force
    $taskSignature=Get-AuthenticodeSignature -LiteralPath $taskFile
    if ($taskItem.PSIsContainer -or $taskItem.Attributes.HasFlag([IO.FileAttributes]::ReparsePoint) -or
      (Resolve-Path -LiteralPath $taskFile).Path -cne $taskFile -or $taskSignature.Status -ne 'Valid' -or
      $taskSignature.SignerCertificate.Subject -notmatch '^CN=Docker Inc, O=Docker Inc,') {throw 'DOCKER_LOCAL_INSTALL_INVALID'}
  }
  return @{Base=$taskBase;Cli=$taskCli;Desktop=$taskDesktop;StopPlugin=$taskStopPlugin}
}
function Assert-TaskOwnedTree($taskInstall,$taskProcesses,$taskRoot) {
  if ($null -eq $taskRoot -or $taskRoot.ExecutablePath -cne $taskInstall.Desktop -or $taskRoot.Name -cne 'Docker Desktop.exe') {throw 'DOCKER_LOCAL_OWNER_UNVERIFIED'}
  $taskByPid=@{};foreach($taskProcess in $taskProcesses){$taskByPid[[int]$taskProcess.ProcessId]=$taskProcess}
  $taskSigned=@{}
  foreach($taskProcess in $taskProcesses) {
    $taskPath=$taskProcess.ExecutablePath
    if (-not $taskPath -or -not $taskPath.StartsWith($taskInstall.Base+'\',[StringComparison]::Ordinal) -or
      $taskProcess.CreationDate -lt $taskRoot.CreationDate) {throw 'DOCKER_LOCAL_FOREIGN_PROCESS'}
    if (-not $taskSigned.ContainsKey($taskPath)) {
      $taskItem=Get-Item -LiteralPath $taskPath -Force
      $taskSignature=Get-AuthenticodeSignature -LiteralPath $taskPath
      if ($taskItem.Attributes.HasFlag([IO.FileAttributes]::ReparsePoint) -or (Resolve-Path -LiteralPath $taskPath).Path -cne $taskPath -or
        $taskSignature.Status -ne 'Valid' -or $taskSignature.SignerCertificate.Subject -notmatch '^CN=Docker Inc, O=Docker Inc,') {throw 'DOCKER_LOCAL_FOREIGN_PROCESS'}
      $taskSigned[$taskPath]=$true
    }
    $taskCurrent=$taskProcess;$taskSeen=@{};$taskFound=$false
    for($taskDepth=0;$taskDepth -lt 32;$taskDepth++) {
      if ($taskCurrent.ProcessId -eq $taskRoot.ProcessId) {$taskFound=$true;break}
      if ($taskSeen.ContainsKey([int]$taskCurrent.ProcessId) -or -not $taskByPid.ContainsKey([int]$taskCurrent.ParentProcessId)) {break}
      $taskSeen[[int]$taskCurrent.ProcessId]=$true;$taskCurrent=$taskByPid[[int]$taskCurrent.ParentProcessId]
    }
    if (-not $taskFound) {throw 'DOCKER_LOCAL_FOREIGN_PROCESS'}
  }
}
try {
  $taskInstall=Get-TaskDockerInstall
  $taskProcesses=@(Get-TaskDockerProcesses)
  if ($Action -in @('inspect-stopped','verify-stopped')) {
    if ($taskProcesses.Count -ne 0) {throw 'DOCKER_LOCAL_ALREADY_RUNNING'}
    if ($Action -eq 'inspect-stopped') {
      [pscustomobject]@{mode='verified-stopped-docker-install';stopped=$true;signaturesVerified=$true;cliPath=$taskInstall.Cli;stopPluginPath=$taskInstall.StopPlugin} | ConvertTo-Json -Compress
    } else {[pscustomobject]@{mode='verified-stopped-docker';stopped=$true;processes=0} | ConvertTo-Json -Compress}
  } elseif ($Action -eq 'start-hidden') {
    if ($taskProcesses.Count -ne 0) {throw 'DOCKER_LOCAL_ALREADY_RUNNING'}
    $taskStarted=Start-Process -FilePath $taskInstall.Desktop -WindowStyle Hidden -PassThru
    $taskRoot=Get-CimInstance Win32_Process -Filter ('ProcessId = '+$taskStarted.Id)
    if ($null -eq $taskRoot -or $taskRoot.ExecutablePath -cne $taskInstall.Desktop) {throw 'DOCKER_LOCAL_START_UNVERIFIED'}
    [pscustomobject]@{mode='owned-docker-start';rootPid=[int]$taskRoot.ProcessId;startedAtUtc=$taskRoot.CreationDate.ToUniversalTime().ToString('o')} | ConvertTo-Json -Compress
  } else {
    if ($Action -eq 'find-owned-start') {
      $taskAfter=[DateTimeOffset]::ParseExact($ExpectedAfterUtc,"yyyy-MM-dd'T'HH:mm:ss.fff'Z'",[Globalization.CultureInfo]::InvariantCulture,[Globalization.DateTimeStyles]::AssumeUniversal)
      if ($ExpectedParentPid -le 0 -or $taskAfter.UtcDateTime -gt [DateTime]::UtcNow -or ([DateTime]::UtcNow-$taskAfter.UtcDateTime).TotalMinutes -gt 20) {throw 'DOCKER_LOCAL_OWNER_UNVERIFIED'}
      $taskRoots=@($taskProcesses | Where-Object { $_.ParentProcessId -eq $ExpectedParentPid -and $_.ExecutablePath -ceq $taskInstall.Desktop -and $_.CreationDate.ToUniversalTime() -ge $taskAfter.UtcDateTime })
      if ($taskProcesses.Count -eq 0) {[pscustomobject]@{mode='no-owned-docker-start';stopped=$true} | ConvertTo-Json -Compress;exit 0}
      if ($taskRoots.Count -ne 1) {throw 'DOCKER_LOCAL_OWNER_UNVERIFIED'}
      $taskRoot=$taskRoots[0]
    } else {
      $taskRoots=@($taskProcesses | Where-Object { $_.ProcessId -eq $ExpectedRootPid })
      if ($taskRoots.Count -ne 1 -or $taskRoots[0].CreationDate.ToUniversalTime().ToString('o') -cne $ExpectedStartedAt) {throw 'DOCKER_LOCAL_OWNER_UNVERIFIED'}
      $taskRoot=$taskRoots[0]
    }
    Assert-TaskOwnedTree $taskInstall $taskProcesses $taskRoot
    [pscustomobject]@{mode='owned-docker-tree';verified=$true;rootPid=[int]$taskRoot.ProcessId;startedAtUtc=$taskRoot.CreationDate.ToUniversalTime().ToString('o');processes=$taskProcesses.Count} | ConvertTo-Json -Compress
  }
} catch {
  $taskCode=if ($_.Exception.Message -cmatch '^DOCKER_LOCAL_[A-Z_]+$') {$_.Exception.Message} else {'DOCKER_LOCAL_UNVERIFIED'}
  [pscustomobject]@{error=$taskCode;privateDetailsSuppressed=$true;filesDeleted=0;settingsChanged=$false} | ConvertTo-Json -Compress
  exit 1
}
