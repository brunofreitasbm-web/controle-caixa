
Add-Type -AssemblyName System.Drawing

function Generate-PngIcon($outFile, $canvasSize) {
    $bmp = New-Object System.Drawing.Bitmap $canvasSize, $canvasSize
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit

    # Background gradient
    $rect = New-Object System.Drawing.Rectangle 0, 0, $canvasSize, $canvasSize
    $c1 = [System.Drawing.Color]::FromArgb(255, 74, 18, 26)
    $c2 = [System.Drawing.Color]::FromArgb(255, 25, 6, 9)
    $bgBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush $rect, $c1, $c2, 45.0

    # Squircle Path
    $corner = [float]($canvasSize * 0.22)
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $path.AddArc(0, 0, ($corner * 2), ($corner * 2), 180, 90)
    $path.AddArc(($canvasSize - $corner * 2), 0, ($corner * 2), ($corner * 2), 270, 90)
    $path.AddArc(($canvasSize - $corner * 2), ($canvasSize - $corner * 2), ($corner * 2), ($corner * 2), 0, 90)
    $path.AddArc(0, ($canvasSize - $corner * 2), ($corner * 2), ($corner * 2), 90, 90)
    $path.CloseAllFigures()

    $g.FillPath($bgBrush, $path)

    # Gold gradient border & accent
    $gc1 = [System.Drawing.Color]::FromArgb(255, 235, 215, 175)
    $gc2 = [System.Drawing.Color]::FromArgb(255, 189, 149, 75)
    $goldBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush $rect, $gc1, $gc2, 45.0
    
    $penWidth = [Math]::Max(3.0, ($canvasSize * 0.03))
    $goldPen = New-Object System.Drawing.Pen $goldBrush, $penWidth
    $g.DrawPath($goldPen, $path)

    # Safe Body
    $rx = [float]($canvasSize * 0.22)
    $ry = [float]($canvasSize * 0.27)
    $rw = [float]($canvasSize * 0.56)
    $rh = [float]($canvasSize * 0.44)

    $innerColor = [System.Drawing.Color]::FromArgb(255, 55, 12, 18)
    $innerBrush = New-Object System.Drawing.SolidBrush $innerColor
    $g.FillRectangle($innerBrush, $rx, $ry, $rw, $rh)

    $thinPen = New-Object System.Drawing.Pen $goldBrush, [float]($canvasSize * 0.025)
    $g.DrawRectangle($thinPen, $rx, $ry, $rw, $rh)

    # Display Top Trap
    $p1 = New-Object System.Drawing.PointF ($canvasSize * 0.36), $ry
    $p2 = New-Object System.Drawing.PointF ($canvasSize * 0.40), ($canvasSize * 0.17)
    $p3 = New-Object System.Drawing.PointF ($canvasSize * 0.60), ($canvasSize * 0.17)
    $p4 = New-Object System.Drawing.PointF ($canvasSize * 0.64), $ry
    $pts = [System.Drawing.PointF[]]($p1, $p2, $p3, $p4)
    $g.FillPolygon($goldBrush, $pts)

    # Drawer lines
    $g.DrawLine($thinPen, [float]($canvasSize * 0.26), [float]($canvasSize * 0.53), [float]($canvasSize * 0.74), [float]($canvasSize * 0.53))
    $g.FillRectangle($goldBrush, [float]($canvasSize * 0.42), [float]($canvasSize * 0.59), [float]($canvasSize * 0.16), [float]($canvasSize * 0.05))

    # Dollar sign
    $fontDollar = New-Object System.Drawing.Font 'Trebuchet MS', [float]($canvasSize * 0.15), [System.Drawing.FontStyle]::Bold
    $sf = New-Object System.Drawing.StringFormat
    $sf.Alignment = [System.Drawing.StringAlignment]::Center
    $sf.LineAlignment = [System.Drawing.StringAlignment]::Center
    $dollarBox = New-Object System.Drawing.RectangleF 0, ($canvasSize * 0.34), $canvasSize, ($canvasSize * 0.2)
    $g.DrawString('$', $fontDollar, $goldBrush, $dollarBox, $sf)

    # Label text
    $fontText = New-Object System.Drawing.Font 'Trebuchet MS', [float]($canvasSize * 0.062), [System.Drawing.FontStyle]::Bold
    $textBox = New-Object System.Drawing.RectangleF 0, ($canvasSize * 0.76), $canvasSize, ($canvasSize * 0.18)
    $g.DrawString('CONTROLE DE CAIXA', $fontText, $goldBrush, $textBox, $sf)

    $bmp.Save($outFile, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose()
    $bmp.Dispose()
}

Generate-PngIcon 'webapp/icons/icon-192.png' 192
Generate-PngIcon 'webapp/icons/icon-512.png' 512
Generate-PngIcon 'webapp/favicon.ico' 64
Write-Host 'PNG icons generated successfully'
