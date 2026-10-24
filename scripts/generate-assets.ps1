$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$source = Join-Path $PSScriptRoot '..\assets\branding\spendwise-logo.png'
$output = Join-Path $PSScriptRoot '..\assets\branding\generated'
if (-not (Test-Path -LiteralPath $source -PathType Leaf)) { throw "Approved logo is missing: $source" }
New-Item -ItemType Directory -Path $output -Force | Out-Null

# Crop only the approved symbol for launcher and small branding assets. The
# source PNG is never modified. The threshold removes only its dark backdrop;
# source colors and shapes are copied directly to transparent PNGs.
Add-Type -ReferencedAssemblies 'System.Drawing' -TypeDefinition @'
using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;

public static class SpendWiseApprovedAssets
{
    private static readonly Color Midnight = Color.FromArgb(10, 15, 30);
    private static readonly Rectangle SymbolCrop = new Rectangle(315, 207, 622, 622);
    private static readonly Rectangle FullLogoCrop = new Rectangle(180, 210, 900, 810);

    private static Bitmap MaskBackground(Bitmap source, bool monochrome)
    {
        var result = new Bitmap(source.Width, source.Height, PixelFormat.Format32bppArgb);
        for (int y = 0; y < source.Height; y++)
        {
            for (int x = 0; x < source.Width; x++)
            {
                Color pixel = source.GetPixel(x, y);
                int strongest = Math.Max(pixel.R, Math.Max(pixel.G, pixel.B));
                int alpha = Math.Max(0, Math.Min(255, (strongest - 95) * 255 / 50));
                if (alpha == 0) continue;
                result.SetPixel(x, y, monochrome
                    ? Color.FromArgb(alpha, 255, 255, 255)
                    : Color.FromArgb(alpha, pixel.R, pixel.G, pixel.B));
            }
        }
        return result;
    }

    private static void Save(Bitmap artwork, Rectangle crop, Rectangle destination, string path, bool solidBackground, int size)
    {
        using (var result = new Bitmap(size, size, PixelFormat.Format32bppArgb))
        using (var graphics = Graphics.FromImage(result))
        {
            graphics.Clear(solidBackground ? Midnight : Color.Transparent);
            graphics.InterpolationMode = InterpolationMode.HighQualityBicubic;
            graphics.CompositingQuality = CompositingQuality.HighQuality;
            graphics.SmoothingMode = SmoothingMode.AntiAlias;
            graphics.PixelOffsetMode = PixelOffsetMode.HighQuality;
            graphics.DrawImage(artwork, destination, crop, GraphicsUnit.Pixel);
            result.Save(path, ImageFormat.Png);
        }
    }

    public static void Generate(string sourcePath, string outputDirectory)
    {
        using (var source = new Bitmap(sourcePath))
        {
            if (source.Width != 1254 || source.Height != 1254)
                throw new InvalidOperationException("The approved SpendWise source dimensions changed; inspect crops before regenerating.");
            using (var color = MaskBackground(source, false))
            using (var mono = MaskBackground(source, true))
            {
                var launcherArea = new Rectangle(170, 170, 684, 684);
                Save(color, SymbolCrop, launcherArea, System.IO.Path.Combine(outputDirectory, "launcher-icon.png"), true, 1024);
                Save(color, SymbolCrop, launcherArea, System.IO.Path.Combine(outputDirectory, "adaptive-foreground.png"), false, 1024);
                Save(mono, SymbolCrop, launcherArea, System.IO.Path.Combine(outputDirectory, "adaptive-monochrome.png"), false, 1024);
                Save(color, FullLogoCrop, new Rectangle(47, 87, 930, 837), System.IO.Path.Combine(outputDirectory, "splash-logo.png"), false, 1024);
                Save(color, SymbolCrop, new Rectangle(0, 0, 192, 192), System.IO.Path.Combine(outputDirectory, "header-symbol.png"), false, 192);
            }
        }
    }
}
'@

[SpendWiseApprovedAssets]::Generate((Resolve-Path -LiteralPath $source).Path, (Resolve-Path -LiteralPath $output).Path)
