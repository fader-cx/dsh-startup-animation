#Requires -Version 5.1
<#
  把开场动画插件装进当前 DSH 配置（profile）。

  - 先备份 cordis.patch.yml，再复制插件包；
  - 以 `insert:` 列表形式追加 Loader 行（DSH 的补丁语义：顶层裸行只会被当成
    「覆盖一个已存在的 id」，新插件必须 insert 才会进入 Loader 树）；
  - 不修改 DeepSeek Harness 安装目录，不碰 app.asar；
  - 可重复运行：先清掉旧条目再写一次。
#>
param([string]$Profile = 'desktop')

$ErrorActionPreference = 'Stop'
$source = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$dshHome = if ($env:DSH_HOME) { $env:DSH_HOME } else { Join-Path $env:USERPROFILE '.dsh' }
$profileDir = Join-Path $dshHome ('profiles\' + $Profile)
$patchFile = Join-Path $profileDir 'cordis.patch.yml'
$pluginId = 'codex-startup-animation'
$pluginName = 'dsh-codex-startup-animation'
$target = Join-Path $profileDir ('node_modules\' + $pluginName)

if (-not (Test-Path -LiteralPath $profileDir)) { throw "找不到 DSH 配置目录：$profileDir" }
if (-not (Test-Path -LiteralPath $patchFile)) { throw "找不到 $patchFile（这个 profile 还没初始化过）" }
if (-not (Test-Path -LiteralPath (Join-Path $source 'lib\client.js'))) { throw '请先运行 tools/build-client.py 生成 lib/client.js' }

$stamp = (Get-Date).ToString('yyyyMMdd-HHmmss')
$backup = "$patchFile.bak-$stamp"
Copy-Item -LiteralPath $patchFile -Destination $backup
Write-Output "已备份：$backup"

if (Test-Path -LiteralPath $target) { Remove-Item -LiteralPath $target -Recurse -Force }
New-Item -ItemType Directory -Path $target -Force | Out-Null
Copy-Item -Path (Join-Path $source 'lib') -Destination $target -Recurse -Force
Copy-Item -LiteralPath (Join-Path $source 'package.json') -Destination $target
Write-Output "已安装插件包：$target"

# 清掉历史条目（无论是裸行还是旧 insert 行），保证幂等。
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
# 去掉因此变空的 `- insert:` 尾巴。
while ($kept.Count -gt 0 -and $kept[$kept.Count - 1] -match '^\s*- insert:\s*$') { $kept.RemoveAt($kept.Count - 1) }
while ($kept.Count -gt 0 -and $kept[$kept.Count - 1].Trim() -eq '') { $kept.RemoveAt($kept.Count - 1) }

$entry = @(
    '',
    '# Codex 风格开场动画（本地插件，撤回见 tools/uninstall.ps1）',
    '- insert:',
    "    - id: $pluginId",
    "      name: `"$pluginName`""
)
$kept.AddRange([string[]]$entry)

# 按 DSH 自己的写法写回：纯 LF、无 BOM（该文件原本就是 LF）。
$nl = "`n"
[IO.File]::WriteAllText($patchFile, (($kept -join $nl) + $nl), (New-Object System.Text.UTF8Encoding($false)))
Write-Output "已写入 Loader 行（insert 形式）：`n$($entry -join "`n")"

Write-Output ''
Write-Output '下一步：完全退出 DeepSeek Harness 桌面端后重新打开，开场动画应当出现。'
Write-Output "回滚：powershell -NoProfile -ExecutionPolicy Bypass -File `"$(Join-Path $PSScriptRoot 'uninstall.ps1')`" -Profile $Profile"
