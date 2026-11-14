#Requires -Version 5.1
<#
  拉取上游动画仓库到构建脚本期望的位置（默认 ../codex-startup-animation-windows）。

  为什么需要这一步：本仓库不收录上游源码（其许可证状态见 THIRD_PARTY_NOTICES.md），
  构建时按需拉取。若你已手动放了该目录，脚本会跳过。

  用法：
    powershell -NoProfile -ExecutionPolicy Bypass -File tools\fetch-upstream.ps1
    powershell -NoProfile -ExecutionPolicy Bypass -File tools\fetch-upstream.ps1 -Force
#>
param(
    [switch]$Force,
    [string]$Remote = 'https://github.com/yanami-sec/codex-startup-animation-windows.git'
)

$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$target = Join-Path (Split-Path $root -Parent) 'codex-startup-animation-windows'

if ((Test-Path -LiteralPath $target) -and -not $Force) {
    Write-Output "上游已存在，跳过：$target"
    Write-Output '要重新拉取请加 -Force（会覆盖该目录）。'
    exit 0
}
if ((Test-Path -LiteralPath $target) -and $Force) {
    Remove-Item -LiteralPath $target -Recurse -Force
}

# 本机若把 https:// 全局重写到镜像站（常见于国内配置），会干扰拉取，
# 这里用一份空的全局配置做一次性调用；TLS 后端指定 openssl 以避开 schannel 的凭据问题。
$env:GIT_CONFIG_GLOBAL = 'NUL'
$env:GIT_CONFIG_NOSYSTEM = '1'
try {
    & git -c http.sslBackend=openssl clone --depth 1 $Remote $target
    if ($LASTEXITCODE -ne 0) { throw "git clone 失败（退出码 $LASTEXITCODE）" }
} finally {
    Remove-Item Env:\GIT_CONFIG_GLOBAL -ErrorAction SilentlyContinue
    Remove-Item Env:\GIT_CONFIG_NOSYSTEM -ErrorAction SilentlyContinue
}

Write-Output "已拉取上游：$target"
Write-Output '下一步：python tools\build-client.py'
