param(
    [string]$OutDir = (Join-Path $PSScriptRoot "..\build")
)

Add-Type -AssemblyName System.Drawing

function New-SyukeiIconBitmap {
    param([int]$Size)

    $bmp = New-Object System.Drawing.Bitmap $Size, $Size
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
    $g.Clear([System.Drawing.Color]::FromArgb(255, 37, 99, 235))

    $margin = [Math]::Max(2, [int][Math]::Floor($Size * 0.1))
    $displayHeight = [Math]::Max(6, [int][Math]::Floor($Size * 0.38))
    $displayWidth = $Size - (2 * $margin)
    $displayRect = New-Object System.Drawing.Rectangle $margin, $margin, $displayWidth, $displayHeight

    $g.FillRectangle([System.Drawing.Brushes]::White, $displayRect)

    $fontSize = [Math]::Max(6.0, [single]($Size * 0.26))
    $font = New-Object System.Drawing.Font ('Segoe UI', $fontSize, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
    $format = New-Object System.Drawing.StringFormat
    $format.Alignment = [System.Drawing.StringAlignment]::Center
    $format.LineAlignment = [System.Drawing.StringAlignment]::Center
    $textBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 30, 64, 175))
    $g.DrawString('123', $font, $textBrush, [System.Drawing.RectangleF]$displayRect, $format)

    $keySize = [Math]::Max(2, [int][Math]::Floor($Size * 0.1))
    $gap = [Math]::Max(1, [int][Math]::Floor($Size * 0.035))
    $startY = $displayRect.Bottom + [Math]::Max(2, [int][Math]::Floor($Size * 0.06))
    $gridWidth = (3 * $keySize) + (2 * $gap)
    $startX = [int][Math]::Floor(($Size - $gridWidth) / 2)
    $keyBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(220, 255, 255, 255))

    for ($row = 0; $row -lt 2; $row++) {
        for ($col = 0; $col -lt 3; $col++) {
            $x = $startX + ($col * ($keySize + $gap))
            $y = $startY + ($row * ($keySize + $gap))
            $g.FillEllipse($keyBrush, $x, $y, $keySize, $keySize)
        }
    }

    $font.Dispose()
    $textBrush.Dispose()
    $keyBrush.Dispose()
    $format.Dispose()
    $g.Dispose()
    return $bmp
}

if (-not (Test-Path $OutDir)) {
    New-Item -ItemType Directory -Path $OutDir | Out-Null
}

$sizes = @(16, 32, 48, 64, 128, 256, 512)
foreach ($size in $sizes) {
    $bitmap = New-SyukeiIconBitmap -Size $size
    $outPath = Join-Path $OutDir "icon-$size.png"
    $bitmap.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $bitmap.Dispose()
}

Copy-Item (Join-Path $OutDir "icon-512.png") (Join-Path $OutDir "icon.png") -Force
Write-Host "Generated icons in $OutDir"
