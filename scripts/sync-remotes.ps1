param(
  [string]$Branch = "main",
  [string]$GiteeUrl = "",
  [switch]$SkipChecks,
  [switch]$AllowDirty,
  [switch]$SkipGithub,
  [switch]$SkipGitee
)

$ErrorActionPreference = "Stop"

function Run(
  [string]$Command,
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$Arguments
) {
  Write-Host "`n> $Command $Arguments" -ForegroundColor Cyan
  & $Command @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "Command failed: $Command $Arguments"
  }
}

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $repoRoot

Run git @("rev-parse", "--is-inside-work-tree")

if ($GiteeUrl.Trim()) {
  $hasGitee = $false
  try {
    $null = & git remote get-url gitee 2>$null
    $hasGitee = $LASTEXITCODE -eq 0
  } catch {
    $hasGitee = $false
  }

  if ($hasGitee) {
    Run git @("remote", "set-url", "gitee", $GiteeUrl.Trim())
  } else {
    Run git @("remote", "add", "gitee", $GiteeUrl.Trim())
  }
}

if (-not $AllowDirty) {
  $dirty = & git status --porcelain
  if ($dirty) {
    Write-Host $dirty
    throw "Working tree is not clean. Commit or stash changes first, or pass -AllowDirty deliberately."
  }
}

if (-not $SkipChecks) {
  Run pnpm @("check")
  Run pnpm @("test")
}

Write-Host "`nConfigured remotes:" -ForegroundColor Green
& git remote -v

if (-not $SkipGithub) {
  Run git @("push", "origin", $Branch, "--tags")
}

if (-not $SkipGitee) {
  $giteeUrl = ""
  try {
    $giteeUrl = (& git remote get-url gitee 2>$null).Trim()
  } catch {
    $giteeUrl = ""
  }

  if (-not $giteeUrl) {
    throw "Gitee remote is not configured. Use -GiteeUrl `"https://gitee.com/<user>/CloudMail.git`" first."
  }

  Run git @("push", "gitee", $Branch, "--tags")
}

Write-Host "`nDone. Source and tags are synchronized." -ForegroundColor Green
