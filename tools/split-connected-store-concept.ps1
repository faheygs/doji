Add-Type -AssemblyName System.Drawing

$sourcePath = 'C:\Users\gfahe\.codex\generated_images\019fdd4a-816c-7d60-953a-db2af0343e05\exec-3903157a-7bdc-4f1c-80e5-ac197be0ac80.png'
$outputDir = Join-Path $PSScriptRoot '..\store-assets\connected-story-concept'
$outputDir = [System.IO.Path]::GetFullPath($outputDir)
[System.IO.Directory]::CreateDirectory($outputDir) | Out-Null

$source = [System.Drawing.Bitmap]::FromFile($sourcePath)
$panelWidth = [int]($source.Width / 3)

try {
  for ($index = 0; $index -lt 3; $index++) {
    $panel = New-Object System.Drawing.Bitmap($panelWidth, $source.Height)
    $graphics = [System.Drawing.Graphics]::FromImage($panel)
    $sourceX = $index * $panelWidth

    try {
      $graphics.DrawImage(
        $source,
        (New-Object System.Drawing.Rectangle(0, 0, $panelWidth, $source.Height)),
        (New-Object System.Drawing.Rectangle($sourceX, 0, $panelWidth, $source.Height)),
        [System.Drawing.GraphicsUnit]::Pixel
      )

      # Replace only the redundant marketing-header logo/name with nearby clean
      # background from the same panel. App UI inside the phone stays unchanged.
      $cleanColor = $panel.GetPixel(340, 105)
      $cleanBrush = New-Object System.Drawing.SolidBrush($cleanColor)
      try {
        $graphics.FillRectangle($cleanBrush, 28, 22, 290, 88)
      }
      finally {
        $cleanBrush.Dispose()
      }
    }
    finally {
      $graphics.Dispose()
    }

    $number = $index + 1
    $outputPath = Join-Path $outputDir ("doji-connected-panel-{0}.png" -f $number)
    $panel.Save($outputPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $panel.Dispose()
    Write-Output $outputPath
  }
}
finally {
  $source.Dispose()
}
