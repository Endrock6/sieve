# Builds a ZIP with forward-slash entry names.
#
# Compress-Archive (and ZipFile.CreateFromDirectory) on Windows PowerShell 5.1
# writes backslashes into entry names, which violates the ZIP spec and makes
# addons.mozilla.org reject the upload. Writing entries ourselves is the only
# reliable fix on this PowerShell version.

param(
    [Parameter(Mandatory = $true)][string]$Source,
    [Parameter(Mandatory = $true)][string]$Destination
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$Source = (Resolve-Path $Source).Path
if (Test-Path $Destination) { Remove-Item $Destination -Force }

$archive = [System.IO.Compression.ZipFile]::Open($Destination, [System.IO.Compression.ZipArchiveMode]::Create)
try {
    $root = $Source
    $files = Get-ChildItem -Path $root -Recurse -File | Sort-Object FullName
    foreach ($file in $files) {
        $relative = $file.FullName.Substring($root.Length + 1).Replace('\', '/')
        [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
            $archive, $file.FullName, $relative, [System.IO.Compression.CompressionLevel]::Optimal) | Out-Null
    }
} finally {
    $archive.Dispose()
}

"wrote $Destination ($([math]::Round((Get-Item $Destination).Length / 1KB, 1)) KB, $($files.Count) entries)"
