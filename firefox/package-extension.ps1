param(
  [string]$OutputPath = (Join-Path $PSScriptRoot 'ChudTube-Plus-Firefox.xpi')
)

$firefoxRoot = (Resolve-Path $PSScriptRoot).Path
$stagingPath = Join-Path ([System.IO.Path]::GetTempPath()) ("chudtube-plus-firefox-" + [guid]::NewGuid())
$archivePath = "$stagingPath.zip"

try {
  New-Item -ItemType Directory -Path $stagingPath -Force | Out-Null
  @('manifest.json', 'src', 'icons') | ForEach-Object {
    Copy-Item -LiteralPath (Join-Path $firefoxRoot $_) -Destination $stagingPath -Recurse -Force
  }

  $resolvedOutput = [System.IO.Path]::GetFullPath($OutputPath, $firefoxRoot)
  if (Test-Path -LiteralPath $resolvedOutput) { Remove-Item -LiteralPath $resolvedOutput -Force }
  Compress-Archive -Path (Join-Path $stagingPath '*') -DestinationPath $archivePath -CompressionLevel Optimal
  Move-Item -LiteralPath $archivePath -Destination $resolvedOutput -Force
  Write-Output "Created $resolvedOutput"
}
finally {
  if (Test-Path -LiteralPath $archivePath) { Remove-Item -LiteralPath $archivePath -Force }
  if (Test-Path -LiteralPath $stagingPath) { Remove-Item -LiteralPath $stagingPath -Recurse -Force }
}
