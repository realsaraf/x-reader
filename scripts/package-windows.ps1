[CmdletBinding()]
param([string] $OutputDirectory = (Join-Path $PSScriptRoot '../release'))

$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$version = (Get-Content -Raw -LiteralPath (Join-Path $repo 'package.json') | ConvertFrom-Json).version
$build = Join-Path $repo 'src-tauri/target/release'
$installer = Get-Item -LiteralPath (Join-Path $build "bundle/nsis/x-reader_${version}_x64-setup.exe")

$portable = & (Join-Path $PSScriptRoot 'package-portable.ps1') -ReleaseDirectory $build -OutputDirectory $OutputDirectory
$output = (Resolve-Path -LiteralPath $OutputDirectory).Path
$setup = Join-Path $output "x-reader-${version}-windows-x64-setup.exe"
Copy-Item -LiteralPath $installer.FullName -Destination $setup -Force
$hashes = foreach ($file in @($setup, $portable)) {
    $hash = (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant()
    "$hash  $([IO.Path]::GetFileName($file))"
}
[IO.File]::WriteAllText((Join-Path $output 'SHA256SUMS.txt'), ($hashes -join "`n") + "`n", [Text.Encoding]::ASCII)
Write-Output $setup
Write-Output $portable
