#Requires -Version 5.1
<#
  撤掉开场动画插件：删除插件包，并从 cordis.patch.yml 里去掉对应条目。
  会先备份当前补丁文件，再写回。
#>
param([string]$Profile = 'desktop')

$ErrorActionPreference = 'Stop'
$dshHome = if ($env:DSH_HOME) { $env:DSH_HOME } else { Join-Path $env:USERPROFILE '.dsh' }
$profileDir = Join-Path $dshHome ('profiles\' + $Profile)
$patchFile = Join-Path $profileDir 'cordis.patch.yml'
$pluginId = 'codex-startup-animation'
$pluginName = 'dsh-codex-startup-animation'
$target = Join-Path $profileDir ('node_modules\' + $pluginName)

if (Test-Path -LiteralPath $target) {
    Remove-Item -LiteralPath $target -Recurse -Force
    Write-Output "已删除插件包：$target"
} else {
    Write-Output "插件包不存在，跳过：$target"
}

if (Test-Path -LiteralPath $patchFile) {
    $stamp = (Get-Date).ToString('yyyyMMdd-HHmmss')
    Copy-Item -LiteralPath $patchFile -Destination "$patchFile.bak-$stamp"
    $lines = @(Get-Content -LiteralPath $patchFile)
    $kept = New-Object System.Collections.Generic.List[string]
    $skipNext = $false
    foreach ($line in $lines) {
        if ($skipNext) {
            $skipNext = $false
            if ($line -match ('^\s+name:\s*["'']?' + [regex]::Escape($pluginName) + '["'']?\s*$')) { continue }
        }
        if ($line -match ('^\s*- id:\s*' + [regex]::Escape($pluginId) + '\s*$')) { $skipNext = $true; continue }
        $kept.Add($line)
    }
    while ($kept.Count -gt 0 -and $kept[$kept.Count - 1] -match '^\s*- insert:\s*$') { $kept.RemoveAt($kept.Count - 1) }
    while ($kept.Count -gt 0 -and $kept[$kept.Count - 1].Trim() -eq '') { $kept.RemoveAt($kept.Count - 1) }
    [IO.File]::WriteAllText($patchFile, (($kept -join "`n") + "`n"), (New-Object System.Text.UTF8Encoding($false)))
    Write-Output "已从补丁文件移除插件条目：$patchFile（备份在最新的 .bak-* 文件）"
}

Write-Output '完全退出并重开 DeepSeek Harness 后，开场动画不再出现。'
