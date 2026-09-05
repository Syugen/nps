[CmdletBinding()]
param(
    # Defaults are relative to this script's directory.
    [string]$LeftRoot = (Join-Path $PSScriptRoot 'images'),
    [string]$RightRoot = (Join-Path $PSScriptRoot 'images_orig')
)

$ErrorActionPreference = 'Stop'

$imageExtensions = @(
    '.jpg', '.jpeg', '.jpe', '.png', '.gif', '.bmp', '.webp', '.tif', '.tiff', '.heic', '.heif'
)

function Get-Bytes {
    param(
        [byte[]]$Bytes,
        [int]$Offset,
        [int]$Count
    )

    $value = [uint64]0
    for ($i = 0; $i -lt $Count; $i++) {
        $value = ($value -shl 8) -bor $Bytes[$Offset + $i]
    }
    return $value
}

function Get-LittleEndianUInt32 {
    param([byte[]]$Bytes, [int]$Offset)
    return [uint32]($Bytes[$Offset] -bor
        ($Bytes[$Offset + 1] -shl 8) -bor
        ($Bytes[$Offset + 2] -shl 16) -bor
        ($Bytes[$Offset + 3] -shl 24))
}

function Get-EndianUInt16 {
    param([byte[]]$Bytes, [int]$Offset, [bool]$LittleEndian)
    if ($LittleEndian) { return [int]($Bytes[$Offset] -bor ($Bytes[$Offset + 1] -shl 8)) }
    return [int](Get-Bytes $Bytes $Offset 2)
}

function Get-EndianUInt32 {
    param([byte[]]$Bytes, [int]$Offset, [bool]$LittleEndian)
    if ($LittleEndian) { return [int](Get-LittleEndianUInt32 $Bytes $Offset) }
    return [int](Get-Bytes $Bytes $Offset 4)
}

function ConvertTo-OrientationValue {
    param($Value)

    if ($Value -is [byte[]]) {
        if ($Value.Length -ge 2) { $Value = [BitConverter]::ToUInt16($Value, 0) }
        elseif ($Value.Length -eq 1) { $Value = $Value[0] }
        else { return 1 }
    }
    try {
        $orientation = [int]$Value
        if ($orientation -ge 1 -and $orientation -le 8) { return $orientation }
    } catch { }
    return 1
}

function Get-WpfOrientation {
    param($Metadata)

    if ($null -eq $Metadata) { return 1 }
    foreach ($query in @('/app1/ifd/{ushort=274}', '/ifd/{ushort=274}', '/{ushort=274}', '/meta/irot')) {
        try {
            $orientation = ConvertTo-OrientationValue ($Metadata.GetQuery($query))
            if ($orientation -ne 1) { return $orientation }
        } catch { }
    }
    return 1
}

function Get-ImageOrientation {
    param([string]$Path)

    # This is the same EXIF reader used by inspect-image-metadata.ps1.
    try {
        Add-Type -AssemblyName System.Drawing -ErrorAction Stop
        $image = [System.Drawing.Image]::FromFile($Path)
        try {
            $orientationTag = @($image.PropertyItems | Where-Object { $_.Id -eq 0x0112 })
            if ($orientationTag.Count -gt 0) {
                return (ConvertTo-OrientationValue ($orientationTag[0].Value))
            }
        } finally {
            $image.Dispose()
        }
    } catch { }

    # Fall back to the Windows image codec metadata reader, needed for HEIC.
    try {
        Add-Type -AssemblyName PresentationCore -ErrorAction Stop
        $decoder = [System.Windows.Media.Imaging.BitmapDecoder]::Create(
            [Uri]$Path,
            [System.Windows.Media.Imaging.BitmapCreateOptions]::PreservePixelFormat,
            [System.Windows.Media.Imaging.BitmapCacheOption]::OnLoad)
        return (Get-WpfOrientation ($decoder.Frames[0].Metadata))
    } catch { }

    return 1
}

function Get-ImageDimensions {
    param([string]$Path)

    # HEIC/HEIF requires the Windows HEIF Image Extensions codec.
    $extension = [System.IO.Path]::GetExtension($Path).ToLowerInvariant()
    if ($extension -eq '.heic' -or $extension -eq '.heif') {
        try {
            Add-Type -AssemblyName PresentationCore -ErrorAction Stop
            $decoder = [System.Windows.Media.Imaging.BitmapDecoder]::Create(
                [Uri]$Path,
                [System.Windows.Media.Imaging.BitmapCreateOptions]::PreservePixelFormat,
                [System.Windows.Media.Imaging.BitmapCacheOption]::OnLoad)
            $frame = $decoder.Frames[0]
            return @{ Width = [int]$frame.PixelWidth; Height = [int]$frame.PixelHeight }
        } catch {
            throw "Unable to decode HEIC/HEIF. Install Windows HEIF Image Extensions. $($_.Exception.Message)"
        }
    }

    $bytes = [System.IO.File]::ReadAllBytes($Path)
    if ($bytes.Length -lt 10) { throw "Unable to read image dimensions" }

    # PNG
    if ($bytes.Length -ge 24 -and
        $bytes[0] -eq 0x89 -and $bytes[1] -eq 0x50 -and
        $bytes[2] -eq 0x4E -and $bytes[3] -eq 0x47) {
        return @{ Width = [int](Get-Bytes $bytes 16 4); Height = [int](Get-Bytes $bytes 20 4) }
    }

    # GIF
    if ($bytes.Length -ge 10 -and
        (($bytes[0] -eq 0x47 -and $bytes[1] -eq 0x49 -and $bytes[2] -eq 0x46))) {
        return @{ Width = [int](Get-Bytes $bytes 6 2); Height = [int](Get-Bytes $bytes 8 2) }
    }

    # BMP
    if ($bytes.Length -ge 26 -and $bytes[0] -eq 0x42 -and $bytes[1] -eq 0x4D) {
        return @{ Width = [int](Get-LittleEndianUInt32 $bytes 18); Height = [math]::Abs([int](Get-LittleEndianUInt32 $bytes 22)) }
    }

    # TIFF (handles little-endian II and big-endian MM headers, common uncompressed metadata layout)
    if ($bytes.Length -ge 10 -and
        (($bytes[0] -eq 0x49 -and $bytes[1] -eq 0x49) -or ($bytes[0] -eq 0x4D -and $bytes[1] -eq 0x4D)) -and
        $bytes[2] -eq 0x00 -and $bytes[3] -eq 0x2A) {
        $littleEndian = $bytes[0] -eq 0x49
        if ($littleEndian) {
            $ifdOffset = [int](Get-LittleEndianUInt32 $bytes 4)
        } else {
            $ifdOffset = [int](Get-Bytes $bytes 4 4)
        }
        if ($ifdOffset + 2 -lt $bytes.Length) {
            $entryCount = Get-EndianUInt16 $bytes $ifdOffset $littleEndian
            $width = $null
            $height = $null
            for ($entry = 0; $entry -lt $entryCount; $entry++) {
                $entryOffset = $ifdOffset + 2 + ($entry * 12)
                if ($entryOffset + 12 -gt $bytes.Length) { break }
                $tag = Get-EndianUInt16 $bytes $entryOffset $littleEndian
                $type = Get-EndianUInt16 $bytes ($entryOffset + 2) $littleEndian
                $count = Get-EndianUInt32 $bytes ($entryOffset + 4) $littleEndian
                if ($type -eq 3 -and $count -eq 1) {
                    $value = Get-EndianUInt16 $bytes ($entryOffset + 8) $littleEndian
                } elseif ($type -eq 4 -and $count -eq 1) {
                    $value = Get-EndianUInt32 $bytes ($entryOffset + 8) $littleEndian
                } else { continue }
                if ($tag -eq 256) { $width = $value }
                if ($tag -eq 257) { $height = $value }
            }
            if ($null -ne $width -and $null -ne $height) { return @{ Width = $width; Height = $height } }
        }
    }

    # WebP (VP8X, VP8, or VP8L)
    if ($bytes.Length -ge 30 -and
        $bytes[0] -eq 0x52 -and $bytes[1] -eq 0x49 -and $bytes[2] -eq 0x46 -and $bytes[3] -eq 0x46 -and
        $bytes[8] -eq 0x57 -and $bytes[9] -eq 0x45 -and $bytes[10] -eq 0x42 -and $bytes[11] -eq 0x50) {
        $kind = [Text.Encoding]::ASCII.GetString($bytes, 12, 4)
        if ($kind -eq 'VP8X') {
            return @{ Width = 1 + [int](Get-Bytes $bytes 24 3); Height = 1 + [int](Get-Bytes $bytes 27 3) }
        }
        if ($kind -eq 'VP8L' -and $bytes[21] -eq 0x2F) {
            $bits = [uint32](Get-Bytes $bytes 21 5)
            return @{ Width = 1 + [int]($bits -band 0x3FFF); Height = 1 + [int](($bits -shr 14) -band 0x3FFF) }
        }
        if ($kind -eq 'VP8 ' -and $bytes.Length -ge 30) {
            return @{ Width = [int](Get-Bytes $bytes 26 2); Height = [int](Get-Bytes $bytes 28 2) }
        }
    }

    # JPEG: scan markers until a frame marker containing width and height is found.
    if ($bytes[0] -eq 0xFF -and $bytes[1] -eq 0xD8) {
        $i = 2
        while ($i + 9 -lt $bytes.Length) {
            while ($i -lt $bytes.Length -and $bytes[$i] -ne 0xFF) { $i++ }
            while ($i -lt $bytes.Length -and $bytes[$i] -eq 0xFF) { $i++ }
            if ($i -ge $bytes.Length) { break }
            $marker = $bytes[$i++]
            if ($marker -eq 0xD9 -or $marker -eq 0xDA) { break }
            if ($marker -eq 0x01 -or ($marker -ge 0xD0 -and $marker -le 0xD7)) { continue }
            if ($i + 1 -ge $bytes.Length) { break }
            $segmentLength = [int](Get-Bytes $bytes $i 2)
            if ($segmentLength -lt 2 -or $i + $segmentLength -gt $bytes.Length) { break }
            if (($marker -ge 0xC0 -and $marker -le 0xC3) -or
                ($marker -ge 0xC5 -and $marker -le 0xC7) -or
                ($marker -ge 0xC9 -and $marker -le 0xCB) -or
                ($marker -ge 0xCD -and $marker -le 0xCF)) {
                $width = [int](Get-Bytes $bytes ($i + 5) 2)
                $height = [int](Get-Bytes $bytes ($i + 3) 2)
                return @{ Width = $width; Height = $height }
            }
            $i += $segmentLength
        }
    }

    throw "Unsupported image format or unable to read dimensions"
}

function Get-DisplayDimensions {
    param([hashtable]$ImageInfo)

    $orientation = if ($ImageInfo.ContainsKey('Orientation')) { [int]$ImageInfo.Orientation } else { 1 }
    if ($orientation -in @(5, 6, 7, 8)) {
        return @{ Width = $ImageInfo.Height; Height = $ImageInfo.Width; Orientation = $orientation }
    }
    return @{ Width = $ImageInfo.Width; Height = $ImageInfo.Height; Orientation = $orientation }
}

function Get-RelativePath {
    param([string]$Root, [string]$Path)

    # Uri-based implementation works in both Windows PowerShell 5.1 and PowerShell 7+.
    $rootUri = [Uri]::new(($Root.TrimEnd('\', '/') + [System.IO.Path]::DirectorySeparatorChar))
    $pathUri = [Uri]::new($Path)
    return [Uri]::UnescapeDataString($rootUri.MakeRelativeUri($pathUri).ToString()).Replace('\', '/')
}

function Get-ComparisonHash {
    param([System.IO.FileInfo]$LeftFile, [System.IO.FileInfo]$RightFile)

    # This reads file bytes but avoids the much slower HEIC image decode on cache hits.
    $leftHash = (Get-FileHash -LiteralPath $LeftFile.FullName -Algorithm MD5).Hash
    $rightHash = (Get-FileHash -LiteralPath $RightFile.FullName -Algorithm MD5).Hash
    return "$leftHash`:$rightHash"
}

if (-not (Test-Path -LiteralPath $LeftRoot -PathType Container)) { throw "Left folder does not exist: $LeftRoot" }
if (-not (Test-Path -LiteralPath $RightRoot -PathType Container)) { throw "Right folder does not exist: $RightRoot" }

$leftBase = (Resolve-Path -LiteralPath $LeftRoot).Path
$rightBase = (Resolve-Path -LiteralPath $RightRoot).Path
$missingFolders = 0
$missingFiles = 0
$ratioMismatches = 0
$readErrors = 0
$cachePath = Join-Path $rightBase '.image-compare-ok.json'
$okCache = @{}

if (Test-Path -LiteralPath $cachePath -PathType Leaf) {
    try {
        $cachedData = Get-Content -LiteralPath $cachePath -Raw | ConvertFrom-Json
        if ($cachedData -is [Array]) {
            # Migrate the earlier [{"Key":"...", "Hash":"..."}] representation.
            foreach ($item in $cachedData) {
                if ($null -ne $item.Key -and $null -ne $item.Hash) {
                    $okCache[[string]$item.Key] = [string]$item.Hash
                }
            }
        } else {
            foreach ($property in $cachedData.PSObject.Properties) {
                $okCache[[string]$property.Name] = [string]$property.Value
            }
        }
    } catch {
        Write-Warning "Could not read cache; no entries will be used: $($_.Exception.Message)"
    }
}

Write-Host "Comparing folders: $leftBase  <=>  $rightBase"

$leftDirectories = @(Get-ChildItem -LiteralPath $leftBase -Directory -Recurse)
foreach ($directory in $leftDirectories) {
    $relative = Get-RelativePath $leftBase $directory.FullName
    $rightDirectory = Join-Path $rightBase $relative
    if (-not (Test-Path -LiteralPath $rightDirectory -PathType Container)) {
        Write-Warning "Missing folder on right: $relative"
        $missingFolders++
    }
}

# Build the left file list one folder at a time. Folders missing on the right
# are skipped entirely, so their files are never opened or dimension-checked.
$leftFiles = @(
    Get-ChildItem -LiteralPath $leftBase -File
    foreach ($directory in $leftDirectories) {
        $relative = Get-RelativePath $leftBase $directory.FullName
        $rightDirectory = Join-Path $rightBase $relative
        if (Test-Path -LiteralPath $rightDirectory -PathType Container) {
            Get-ChildItem -LiteralPath $directory.FullName -File
        }
    }
)
$leftFiles = @($leftFiles | Where-Object {
    $imageExtensions -contains $_.Extension.ToLowerInvariant()
})
$rightFiles = @(Get-ChildItem -LiteralPath $rightBase -File -Recurse | Where-Object {
    $imageExtensions -contains $_.Extension.ToLowerInvariant()
})

$rightIndex = @{}
foreach ($file in $rightFiles) {
    $relativeDirectory = Get-RelativePath $rightBase $file.DirectoryName
    $key = "$relativeDirectory/$($file.BaseName)".Replace('\', '/').ToLowerInvariant()
    if (-not $rightIndex.ContainsKey($key)) {
        $rightIndex[$key] = New-Object 'System.Collections.Generic.List[object]'
    }
    [void]$rightIndex[$key].Add($file)
}

foreach ($leftFile in $leftFiles) {
    $relativeDirectory = Get-RelativePath $leftBase $leftFile.DirectoryName
    $key = "$relativeDirectory/$($leftFile.BaseName)".Replace('\', '/').ToLowerInvariant()
    $rightDirectory = Join-Path $rightBase $relativeDirectory
    if (-not (Test-Path -LiteralPath $rightDirectory -PathType Container)) {
        Write-Warning "Skipping file because its right-side folder is missing: $(Get-RelativePath $leftBase $leftFile.FullName)"
        $missingFiles++
        continue
    }
    $matches = if ($rightIndex.ContainsKey($key)) { @($rightIndex[$key].ToArray()) } else { @() }

    if ($matches.Count -eq 0) {
        Write-Warning "Missing file on right: $(Get-RelativePath $leftBase $leftFile.FullName)"
        $missingFiles++
        continue
    }
    if ($matches.Count -gt 1) {
        Write-Warning "Multiple files with the same name on right; cannot choose a unique match: $key ($($matches.Name -join ', '))"
        continue
    }

    $rightFile = $matches[0]
    try {
        $comparisonHash = Get-ComparisonHash $leftFile $rightFile
        if ($okCache.ContainsKey($key) -and $okCache[$key] -eq $comparisonHash) {
            Write-Host ("SKIP (already checked): {0} | LEFT {1} | RIGHT {2}" -f $key, $leftFile.Name, $rightFile.Name)
            continue
        }
    } catch {
        $comparisonHash = $null
        Write-Warning "Could not calculate cache hash; checking image dimensions: $key -- $($_.Exception.Message)"
    }

    try {
        $leftImageInfo = Get-ImageDimensions $leftFile.FullName
        $leftImageInfo['Orientation'] = Get-ImageOrientation $leftFile.FullName
        $leftSize = Get-DisplayDimensions $leftImageInfo
    } catch {
        Write-Warning "Failed to read LEFT image dimensions: $($leftFile.FullName) -- $($_.Exception.Message)"
        $readErrors++
        continue
    }
    try {
        $rightImageInfo = Get-ImageDimensions $rightFile.FullName
        $rightImageInfo['Orientation'] = Get-ImageOrientation $rightFile.FullName
        $rightSize = Get-DisplayDimensions $rightImageInfo
    } catch {
        Write-Warning "Failed to read RIGHT image dimensions: $($rightFile.FullName) -- $($_.Exception.Message)"
        $readErrors++
        continue
    }

    # Compare displayed dimensions after applying each image's actual orientation tag.
    $leftRatio = [decimal]$leftSize.Width / [decimal]$leftSize.Height
    $rightRatio = [decimal]$rightSize.Width / [decimal]$rightSize.Height
    $leftRatioRounded = [math]::Round($leftRatio, 2)
    $rightRatioRounded = [math]::Round($rightRatio, 2)
    if ($leftRatioRounded -ne $rightRatioRounded) {
        $reversedDimensions = ([decimal]$leftSize.Width * [decimal]$rightSize.Width) -eq `
            ([decimal]$leftSize.Height * [decimal]$rightSize.Height)
        $reversedNote = if ($reversedDimensions) { ' Dimensions are reversed; still treated as a mismatch.' } else { '' }
        Write-Warning ("Aspect ratio mismatch: {0} | LEFT {1} ({2}x{3}, orientation {4}, ratio {5:N2}) | RIGHT {6} ({7}x{8}, orientation {9}, ratio {10:N2}).{11}" -f `
            $key, $leftFile.FullName, $leftSize.Width, $leftSize.Height, $leftSize.Orientation, $leftRatioRounded, $rightFile.FullName, $rightSize.Width, $rightSize.Height, $rightSize.Orientation, $rightRatioRounded, $reversedNote)
        $ratioMismatches++
    } else {
        Write-Host ("OK: {0} | LEFT {1} ({2}x{3}, orientation {4}) | RIGHT {5} ({6}x{7}, orientation {8})" -f `
            $key, $leftFile.Name, $leftSize.Width, $leftSize.Height, $leftSize.Orientation, $rightFile.Name, $rightSize.Width, $rightSize.Height, $rightSize.Orientation)
        if ($null -ne $comparisonHash) { $okCache[$key] = $comparisonHash }
    }
}

try {
    $cacheJson = ConvertTo-Json -InputObject $okCache -Depth 2
    Set-Content -LiteralPath $cachePath -Value $cacheJson -Encoding UTF8
} catch {
    Write-Warning "Could not save cache: $cachePath -- $($_.Exception.Message)"
}

Write-Host "Done. Left images: $($leftFiles.Count); missing files: $missingFiles; missing folders: $missingFolders; aspect ratio mismatches: $ratioMismatches; dimension read errors: $readErrors"
if (($missingFolders + $missingFiles + $ratioMismatches + $readErrors) -gt 0) { exit 1 }
exit 0
