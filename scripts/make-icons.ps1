Add-Type -AssemblyName System.Drawing

$ErrorActionPreference = "Stop"
$outDir = Join-Path (Split-Path $PSScriptRoot -Parent) "icons"
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

function New-RoundedRectPath([float]$x, [float]$y, [float]$w, [float]$h, [float]$r) {
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = $r * 2
  $path.AddArc($x, $y, $d, $d, 180, 90)
  $path.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
  $path.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
  $path.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
  $path.CloseFigure()
  return $path
}

function Save-Icon([int]$size) {
  $bmp = New-Object System.Drawing.Bitmap $size, $size
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.Clear([System.Drawing.Color]::FromArgb(0, 0, 0, 0))

  $pad = [Math]::Max(1, [int]($size * 0.06))
  $radius = [Math]::Max(2, $size * 0.22)
  $bgPath = New-RoundedRectPath $pad $pad ($size - 2 * $pad) ($size - 2 * $pad) $radius
  $bg = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 20, 20, 24))
  $g.FillPath($bg, $bgPath)

  $play = New-Object System.Drawing.Drawing2D.GraphicsPath
  $left = $size * 0.24
  $top = $size * 0.30
  $bottom = $size * 0.70
  $right = $size * 0.58
  $play.AddPolygon(@(
      (New-Object System.Drawing.PointF ($left, $top)),
      (New-Object System.Drawing.PointF ($right, ($size * 0.50))),
      (New-Object System.Drawing.PointF ($left, $bottom))
    ))
  $red = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 255, 59, 78))
  $g.FillPath($red, $play)

  if ($size -ge 32) {
    $white = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(230, 244, 244, 245))
    $lineX = $size * 0.62
    $lineW = $size * 0.22
    $lineH = [Math]::Max(1.5, $size * 0.045)
    foreach ($i in 0..2) {
      $y = $size * (0.36 + $i * 0.12)
      $w = $lineW * (1 - $i * 0.18)
      $g.FillRectangle($white, $lineX, $y, $w, $lineH)
    }
    $white.Dispose()
  }

  $plusBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 125, 255, 179))
  $plus = [Math]::Max(1.4, $size * 0.07)
  $thick = [Math]::Max(1.2, $size * 0.035)
  $cx = $size * 0.78
  $cy = $size * 0.22
  $g.FillRectangle($plusBrush, $cx - $plus, $cy - $thick / 2, $plus * 2, $thick)
  $g.FillRectangle($plusBrush, $cx - $thick / 2, $cy - $plus, $thick, $plus * 2)

  $path = Join-Path $outDir ("icon{0}.png" -f $size)
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)

  $plusBrush.Dispose()
  $red.Dispose()
  $bg.Dispose()
  $play.Dispose()
  $bgPath.Dispose()
  $g.Dispose()
  $bmp.Dispose()
}

@(16, 32, 48, 128) | ForEach-Object { Save-Icon $_ }
Write-Output "Wrote icons to $outDir"
