param(
  [string]$Repo = "lurin7/cloud-mail",
  [string]$Tag = "v1.1.2",
  [string]$Title = "CloudMail V1.1.2",
  [string]$Branch = "main",
  [string]$NotesFile = "releases/v1.1.2-release-notes.md",
  [string]$AssetPath = "releases/cloudmail-v1.1.2.apk",
  [string]$Token = $env:GITEE_TOKEN,
  [switch]$Prerelease
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $repoRoot

if (-not $Token.Trim()) {
  throw "Missing Gitee token. Set env:GITEE_TOKEN first, or pass -Token. Create it at https://gitee.com/profile/personal_access_tokens"
}

if (-not (Test-Path -LiteralPath $NotesFile)) {
  throw "Notes file not found: $NotesFile"
}

if (-not (Test-Path -LiteralPath $AssetPath)) {
  throw "Asset file not found: $AssetPath"
}

$parts = $Repo.Split("/", 2)
if ($parts.Count -ne 2) {
  throw "Repo must be owner/repo, for example lurin7/cloud-mail"
}
$owner = [uri]::EscapeDataString($parts[0])
$repoName = [uri]::EscapeDataString($parts[1])
$apiBase = "https://gitee.com/api/v5/repos/$owner/$repoName/releases"
$notes = Get-Content -LiteralPath $NotesFile -Raw -Encoding UTF8

Write-Host "Checking Gitee release $Repo $Tag ..." -ForegroundColor Cyan
$releases = Invoke-RestMethod -Method Get -Uri $apiBase -Body @{ access_token = $Token } -TimeoutSec 30
$release = @($releases) | Where-Object { $_.tag_name -eq $Tag } | Select-Object -First 1

if (-not $release) {
  Write-Host "Creating release $Tag ..." -ForegroundColor Cyan
  $release = Invoke-RestMethod -Method Post -Uri $apiBase -Body @{
    access_token = $Token
    tag_name = $Tag
    name = $Title
    body = $notes
    target_commitish = $Branch
    prerelease = [bool]$Prerelease
  } -TimeoutSec 60
} else {
  Write-Host "Release already exists, keeping existing release and uploading asset if needed." -ForegroundColor Yellow
}

if (-not $release.id) {
  throw "Gitee release id was not returned."
}

$asset = Resolve-Path -LiteralPath $AssetPath
$encodedToken = [uri]::EscapeDataString($Token)
$uploadUrl = "$apiBase/$($release.id)/attach_files?access_token=$encodedToken"
Write-Host "Uploading asset $asset ..." -ForegroundColor Cyan

Add-Type -AssemblyName System.Net.Http

$client = [System.Net.Http.HttpClient]::new()
$form = [System.Net.Http.MultipartFormDataContent]::new()
$stream = [System.IO.File]::OpenRead($asset)
try {
  $fileContent = [System.Net.Http.StreamContent]::new($stream)
  $fileContent.Headers.ContentType = [System.Net.Http.Headers.MediaTypeHeaderValue]::Parse("application/vnd.android.package-archive")
  $form.Add($fileContent, "file", [System.IO.Path]::GetFileName($asset))
  $response = $client.PostAsync($uploadUrl, $form).GetAwaiter().GetResult()
  $responseText = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
  if (-not $response.IsSuccessStatusCode) {
    throw "Upload failed: $([int]$response.StatusCode) $responseText"
  }
  Write-Host $responseText
} finally {
  $stream.Dispose()
  $form.Dispose()
  $client.Dispose()
}

Write-Host "`nGitee release ready: https://gitee.com/$Repo/releases/$Tag" -ForegroundColor Green
