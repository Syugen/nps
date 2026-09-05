[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$SourceRoot,

    [ValidateRange(1, 10000)]
    [int]$MaxHeight = 1600,

    [ValidateRange(1, 100)]
    [int]$WebPQuality = 85
)

$ErrorActionPreference = 'Stop'

if (-not (Get-Command magick -ErrorAction SilentlyContinue)) {
    throw 'ImageMagick is required. Install it so that the magick command is available.'
}

$sourceBase = $SourceRoot
if (-not (Test-Path -LiteralPath $sourceBase -PathType Container)) {
    throw "Source folder does not exist: $SourceRoot"
}
$sourceBase = (Resolve-Path -LiteralPath $sourceBase).Path

$webpRoot = Join-Path $sourceBase 'webp'
$imageExtensions = @('.jpg', '.jpeg', '.png', '.gif', '.heic', '.tif', '.tiff', '.webp')

Get-ChildItem -LiteralPath $sourceBase -File -Recurse | Where-Object {
    $_.FullName -notlike "$webpRoot*" -and $imageExtensions -contains $_.Extension.ToLowerInvariant()
} | ForEach-Object {
    $relativePath = $_.FullName.Substring($sourceBase.Length).TrimStart('\', '/')
    $relativeDirectory = Split-Path -Path $relativePath -Parent
    $outputDirectory = if ($relativeDirectory) { Join-Path $webpRoot $relativeDirectory } else { $webpRoot }
    $outputPath = Join-Path $outputDirectory ($_.BaseName + '.webp')
    $outputRelativePath = if ($relativeDirectory) { Join-Path (Join-Path 'webp' $relativeDirectory) ($_.BaseName + '.webp') } else { Join-Path 'webp' ($_.BaseName + '.webp') }

    if (Test-Path -LiteralPath $outputPath -PathType Leaf) {
        Write-Host "SKIP  $relativePath"
        return
    }

    New-Item -ItemType Directory -Force -Path $outputDirectory | Out-Null
    Write-Host "MAKE  $relativePath -> $outputRelativePath"
    & magick $_.FullName -auto-orient -resize "x$MaxHeight>" -quality $WebPQuality -define webp:method=6 $outputPath
    if ($LASTEXITCODE -ne 0) {
        throw "ImageMagick failed: $relativePath"
    }
}
