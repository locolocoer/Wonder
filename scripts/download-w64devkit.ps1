# Download and extract w64devkit (portable gcc toolchain) into vendor/w64devkit/.
# Shared by local development and GitHub Actions CI.
$ErrorActionPreference = "Stop"

$version = "2.10.0"
$repoRoot = Join-Path $PSScriptRoot ".."
$target = Join-Path $repoRoot "vendor\w64devkit"

# Idempotent: skip if already present.
if (Test-Path (Join-Path $target "bin\gcc.exe")) {
    Write-Host "w64devkit already present, skipping download: $target"
    exit 0
}

$url = "https://github.com/skeeto/w64devkit/releases/download/v$version/w64devkit-x64-$version.7z.exe"
$exe = Join-Path $env:TEMP "w64devkit-x64-$version.7z.exe"

Write-Host "Downloading $url"
curl.exe -sL --retry 3 --retry-delay 3 -o $exe $url
if ($LASTEXITCODE -ne 0) { throw "Failed to download w64devkit" }

$vendor = Join-Path $repoRoot "vendor"
New-Item -ItemType Directory -Force -Path $vendor | Out-Null
Write-Host "Extracting to $vendor"
& $exe -o"$vendor" -y | Out-Null
if ($LASTEXITCODE -ne 0) { throw "Failed to extract w64devkit" }

# Trim: drop 32-bit toolchain, sources and the cmake family.
Remove-Item "$target\lib32" -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item "$target\src" -Recurse -Force -ErrorAction SilentlyContinue
foreach ($n in @("cmake.exe","cpack.exe","ccmake.exe","ctest.exe","cmcldeps.exe","dcmake.exe")) {
    Remove-Item "$target\bin\$n" -Force -ErrorAction SilentlyContinue
}

if (-not (Test-Path (Join-Path $target "bin\gcc.exe"))) { throw "gcc.exe not found after extraction" }
Write-Host "Done: $target\bin\gcc.exe"
