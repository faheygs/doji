Add-Type -AssemblyName System.Drawing

$sourceDir = Join-Path $PSScriptRoot '..\store-assets\connected-story-concept'
$sourceDir = [System.IO.Path]::GetFullPath($sourceDir)
$appleDir = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\store-assets\app-store\connected-story-6.9-inch'))
$apple65Dir = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\store-assets\app-store\connected-story-6.5-inch'))
$androidDir = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\store-assets\google-play\connected-story-phone'))

[System.IO.Directory]::CreateDirectory($appleDir) | Out-Null
[System.IO.Directory]::CreateDirectory($apple65Dir) | Out-Null
[System.IO.Directory]::CreateDirectory($androidDir) | Out-Null

function Export-OpaquePng {
  param(
    [Parameter(Mandatory = $true)][string]$SourcePath,
    [Parameter(Mandatory = $true)][string]$OutputPath,
    [Parameter(Mandatory = $true)][int]$Width,
    [Parameter(Mandatory = $true)][int]$Height,
    [Parameter(Mandatory = $true)][int]$DrawX,
    [Parameter(Mandatory = $true)][int]$DrawY,
    [Parameter(Mandatory = $true)][int]$DrawWidth,
    [Parameter(Mandatory = $true)][int]$DrawHeight
  )

  $source = [System.Drawing.Bitmap]::FromFile($SourcePath)
  $target = New-Object System.Drawing.Bitmap($Width, $Height, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
  $graphics = [System.Drawing.Graphics]::FromImage($target)

  try {
    $graphics.Clear([System.Drawing.Color]::FromArgb(250, 249, 247))
    $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $graphics.DrawImage($source, $DrawX, $DrawY, $DrawWidth, $DrawHeight)
    $target.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Png)
  }
  finally {
    $graphics.Dispose()
    $target.Dispose()
    $source.Dispose()
  }
}

for ($panel = 1; $panel -le 3; $panel++) {
  $sourcePath = Join-Path $sourceDir ("doji-connected-panel-{0}.png" -f $panel)

  # Apple 6.9-inch accepted portrait canvas. Preserve the full approved 1:2
  # composition and add equal vertical breathing room.
  $applePath = Join-Path $appleDir ("doji-app-store-connected-{0}-1320x2868.png" -f $panel)
  Export-OpaquePng -SourcePath $sourcePath -OutputPath $applePath `
    -Width 1320 -Height 2868 -DrawX 0 -DrawY 114 -DrawWidth 1320 -DrawHeight 2640

  # App Store Connect currently exposes the 6.5-inch bucket for this listing.
  # Preserve the exact approved 1:2 artwork and add equal vertical breathing room.
  $apple65Path = Join-Path $apple65Dir ("doji-app-store-connected-{0}-1242x2688.png" -f $panel)
  Export-OpaquePng -SourcePath $sourcePath -OutputPath $apple65Path `
    -Width 1242 -Height 2688 -DrawX 0 -DrawY 102 -DrawWidth 1242 -DrawHeight 2484

  # Google Play recommended 9:16 portrait canvas. Fill the full width and crop
  # only excess whitespace (170 px from top, 70 px from bottom after scaling).
  $androidPath = Join-Path $androidDir ("doji-google-play-connected-{0}-1080x1920.png" -f $panel)
  Export-OpaquePng -SourcePath $sourcePath -OutputPath $androidPath `
    -Width 1080 -Height 1920 -DrawX 0 -DrawY -170 -DrawWidth 1080 -DrawHeight 2160

  Write-Output $applePath
  Write-Output $apple65Path
  Write-Output $androidPath
}
