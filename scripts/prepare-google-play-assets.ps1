param(
  [string]$SourceIcon = (Join-Path $PSScriptRoot '..\assets\icon-ios.png'),
  [Parameter(Mandatory = $true)]
  [string[]]$SourceScreenshots,
  [string]$OutputDirectory = (Join-Path $PSScriptRoot '..\store-assets\google-play')
)

$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Drawing

$resolvedOutput = [System.IO.Path]::GetFullPath($OutputDirectory)
[System.IO.Directory]::CreateDirectory($resolvedOutput) | Out-Null

function New-Canvas {
  param(
    [int]$Width,
    [int]$Height
  )

  $bitmap = [System.Drawing.Bitmap]::new(
    $Width,
    $Height,
    [System.Drawing.Imaging.PixelFormat]::Format24bppRgb
  )
  $bitmap.SetResolution(72, 72)
  return $bitmap
}

function Set-HighQualityGraphics {
  param([System.Drawing.Graphics]$Graphics)

  $Graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceOver
  $Graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
  $Graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $Graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $Graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
}

$iconSource = [System.Drawing.Image]::FromFile([System.IO.Path]::GetFullPath($SourceIcon))
try {
  $icon = New-Canvas -Width 512 -Height 512
  try {
    $graphics = [System.Drawing.Graphics]::FromImage($icon)
    try {
      Set-HighQualityGraphics -Graphics $graphics
      $graphics.Clear([System.Drawing.Color]::White)
      $graphics.DrawImage($iconSource, 0, 0, 512, 512)
    }
    finally {
      $graphics.Dispose()
    }

    $icon.Save(
      (Join-Path $resolvedOutput 'icon-512.png'),
      [System.Drawing.Imaging.ImageFormat]::Png
    )
  }
  finally {
    $icon.Dispose()
  }

  $feature = New-Canvas -Width 1024 -Height 500
  try {
    $graphics = [System.Drawing.Graphics]::FromImage($feature)
    try {
      Set-HighQualityGraphics -Graphics $graphics
      $graphics.Clear([System.Drawing.Color]::White)
      $graphics.DrawImage($iconSource, 42, 44, 412, 412)

      $titleFont = [System.Drawing.Font]::new('Segoe UI', 58, [System.Drawing.FontStyle]::Bold)
      $taglineFont = [System.Drawing.Font]::new('Segoe UI', 25, [System.Drawing.FontStyle]::Regular)
      $titleBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(16, 16, 20))
      $taglineBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(88, 88, 96))
      try {
        $graphics.DrawString('Doji Connect', $titleFont, $titleBrush, 424, 145)
        $graphics.DrawString('One daily challenge. Ten minutes.', $taglineFont, $taglineBrush, 432, 242)
        $graphics.DrawString('Do it. Share it. See who showed up.', $taglineFont, $taglineBrush, 432, 286)
      }
      finally {
        $titleFont.Dispose()
        $taglineFont.Dispose()
        $titleBrush.Dispose()
        $taglineBrush.Dispose()
      }

      $gradient = [System.Drawing.Drawing2D.LinearGradientBrush]::new(
        [System.Drawing.Point]::new(0, 0),
        [System.Drawing.Point]::new(1024, 0),
        [System.Drawing.Color]::FromArgb(255, 93, 55),
        [System.Drawing.Color]::FromArgb(60, 47, 255)
      )
      try {
        $graphics.FillRectangle($gradient, 0, 488, 1024, 12)
      }
      finally {
        $gradient.Dispose()
      }
    }
    finally {
      $graphics.Dispose()
    }

    $feature.Save(
      (Join-Path $resolvedOutput 'feature-graphic-1024x500.png'),
      [System.Drawing.Imaging.ImageFormat]::Png
    )
  }
  finally {
    $feature.Dispose()
  }
}
finally {
  $iconSource.Dispose()
}

$screenshotNames = @(
  'phone-01-feed.png',
  'phone-02-friends.png',
  'phone-03-suggest-challenge.png',
  'phone-04-profile.png',
  'phone-05-shop.png'
)

if ($SourceScreenshots.Count -ne $screenshotNames.Count) {
  throw "Expected $($screenshotNames.Count) screenshots, received $($SourceScreenshots.Count)."
}

for ($index = 0; $index -lt $SourceScreenshots.Count; $index += 1) {
  $source = [System.Drawing.Image]::FromFile(
    [System.IO.Path]::GetFullPath($SourceScreenshots[$index])
  )
  try {
    if ($source.Width -ne 1242 -or $source.Height -ne 2688) {
      throw "Unexpected screenshot dimensions for $($SourceScreenshots[$index]): $($source.Width)x$($source.Height)."
    }

    $canvas = New-Canvas -Width 1512 -Height 2688
    try {
      $graphics = [System.Drawing.Graphics]::FromImage($canvas)
      try {
        Set-HighQualityGraphics -Graphics $graphics
        $graphics.Clear([System.Drawing.Color]::White)
        $graphics.DrawImageUnscaled($source, 135, 0)
      }
      finally {
        $graphics.Dispose()
      }

      $canvas.Save(
        (Join-Path $resolvedOutput $screenshotNames[$index]),
        [System.Drawing.Imaging.ImageFormat]::Png
      )
    }
    finally {
      $canvas.Dispose()
    }
  }
  finally {
    $source.Dispose()
  }
}

Get-ChildItem -LiteralPath $resolvedOutput -File |
  Sort-Object Name |
  Select-Object Name, Length
