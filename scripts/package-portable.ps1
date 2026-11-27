[CmdletBinding()]
param(
    [string] $ReleaseDirectory = (Join-Path $PSScriptRoot '../src-tauri/target/release'),
    [string] $OutputDirectory = (Join-Path $PSScriptRoot '../release')
)

$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$version = (Get-Content -Raw -LiteralPath (Join-Path $repo 'package.json') | ConvertFrom-Json).version
if ($version -notmatch '^\d+\.\d+\.\d+$') { throw "Invalid release version $version" }
$exe = (Get-Item -LiteralPath (Join-Path $ReleaseDirectory 'x-reader.exe')).FullName
if ((Get-Item -LiteralPath $exe).VersionInfo.ProductVersion -ne $version) {
    throw 'Executable version differs from package.json. Build x-reader with Tauri first.'
}
$null = New-Item -ItemType Directory -Force -Path $OutputDirectory
$output = (Resolve-Path -LiteralPath $OutputDirectory).Path
$archive = Join-Path $output "x-reader-${version}-windows-x64-portable.zip"

# Create entries directly. A developer's adjacent data folder must never enter the ZIP.
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$temp = Join-Path $output (".portable-" + [guid]::NewGuid() + ".tmp")
$zip = [System.IO.Compression.ZipFile]::Open($temp, [System.IO.Compression.ZipArchiveMode]::Create)
try {
    foreach ($item in @(
        @{ Path = $exe; Name = 'x-reader.exe' }
        @{ Path = (Join-Path $repo 'LICENSE'); Name = 'LICENSE' }
        @{ Path = (Join-Path $repo 'THIRD-PARTY-NOTICES.txt'); Name = 'THIRD-PARTY-NOTICES.txt' }
        @{ Path = (Join-Path $repo 'docs/PORTABLE.txt'); Name = 'README.txt' }
    )) {
        $null = [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $item.Path, $item.Name)
    }
    $null = $zip.CreateEntry('x-reader.portable')
} finally {
    $zip.Dispose()
}
Move-Item -LiteralPath $temp -Destination $archive -Force
Write-Output $archive
