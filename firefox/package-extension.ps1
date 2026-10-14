param(
  [string]$OutputPath = (Join-Path $PSScriptRoot 'ChudTube-Plus-Firefox.xpi')
)

$firefoxRoot = (Resolve-Path $PSScriptRoot).Path
$tempRoot = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath()).TrimEnd([System.IO.Path]::DirectorySeparatorChar)
$stagingPath = [System.IO.Path]::GetFullPath((Join-Path $tempRoot ("chudtube-plus-firefox-" + [guid]::NewGuid())))
if ([System.IO.Path]::GetDirectoryName($stagingPath) -ne $tempRoot) { throw 'Staging path must be inside the temporary directory.' }
$archivePath = "$stagingPath.zip"

try {
  New-Item -ItemType Directory -Path $stagingPath -Force | Out-Null
  Copy-Item -LiteralPath (Join-Path $firefoxRoot '../PRIVACY.md') -Destination $stagingPath -Force
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
