param([int]$Port,[string]$ScriptPath,[string]$NodePath,[ValidateSet('inspect','stop')][string]$Action='inspect',[int]$ExpectedPid=0)
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=[System.Text.UTF8Encoding]::new($false)
$listeners=@(Get-NetTCPConnection -State Listen -ErrorAction Stop | Where-Object LocalPort -EQ $Port)
$ids=@($listeners | Select-Object -ExpandProperty OwningProcess -Unique)
if($ids.Count -eq 0){@{pid=0;owned=$false}|ConvertTo-Json -Compress;exit 0}
if($ids.Count -ne 1){throw '多个进程占用端口，未作更改。'}
$ownerId=[int]$ids[0]
$proc=Get-CimInstance Win32_Process -Filter "ProcessId=$ownerId"
$expectedNode=[IO.Path]::GetFullPath($NodePath)
$expectedScript=[IO.Path]::GetFullPath($ScriptPath)
# Exact executable and service-script arguments only; no shell or extra scripts.
$nodePattern='(?:"'+[regex]::Escape($expectedNode)+'"|'+[regex]::Escape($expectedNode)+')'
$scriptPattern='(?:"'+[regex]::Escape($expectedScript)+'"|'+[regex]::Escape($expectedScript)+')'
$owned=$null -ne $proc -and $proc.ExecutablePath -ieq $expectedNode -and $proc.CommandLine -imatch ('^\s*'+$nodePattern+'\s+'+$scriptPattern+'\s*$')
if($Action -eq 'stop'){
 if(!$owned -or $ExpectedPid -ne $ownerId){throw '进程路径或PID已改变，未关闭任何进程。'}
 $again=Get-CimInstance Win32_Process -Filter "ProcessId=$ownerId"
 if(!$again -or $again.CreationDate -ne $proc.CreationDate -or $again.CommandLine -ne $proc.CommandLine){throw '进程已变化，未停止。'}
 Stop-Process -Id $ownerId -ErrorAction Stop
}
@{pid=$ownerId;owned=[bool]$owned}|ConvertTo-Json -Compress
