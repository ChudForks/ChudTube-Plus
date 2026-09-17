param(
  [string]$OutputPath = (Join-Path $PSScriptRoot '..\ChudTube-Plus.zip')
)

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$stagingPath = Join-Path ([System.IO.Path]::GetTempPath()) ("chudtube-plus-" + [guid]::NewGuid())
$extensionPath = Join-Path $stagingPath 'ChudTube-Plus'

try {
  New-Item -ItemType Directory -Path $extensionPath -Force | Out-Null
  Copy-Item -LiteralPath (Join-Path $projectRoot 'manifest.json') -Destination $extensionPath -Force
  Copy-Item -LiteralPath (Join-Path $projectRoot 'src') -Destination $extensionPath -Recurse -Force
  $iconsPath = Join-Path $extensionPath 'icons'
  New-Item -ItemType Directory -Path $iconsPath -Force | Out-Null
  @('icon16.png', 'icon32.png', 'icon48.png', 'icon128.png') | ForEach-Object {
    Copy-Item -LiteralPath (Join-Path $projectRoot "icons/$_") -Destination $iconsPath -Force
  }

  $resolvedOutput = [System.IO.Path]::GetFullPath($OutputPath, $projectRoot)
  if (Test-Path -LiteralPath $resolvedOutput) { Remove-Item -LiteralPath $resolvedOutput -Force }
  Compress-Archive -Path $extensionPath -DestinationPath $resolvedOutput -CompressionLevel Optimal
  Write-Output "Created $resolvedOutput"
}
finally {
  if (Test-Path -LiteralPath $stagingPath) { Remove-Item -LiteralPath $stagingPath -Recurse -Force }
}
