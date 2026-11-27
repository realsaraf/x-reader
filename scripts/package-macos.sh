#!/bin/bash
# Package the signed universal app without changing any files inside its bundle.
set -euo pipefail
repo=$(cd "$(dirname "$0")/.." && pwd)
cd "$repo"
version=$(node -p "require('./package.json').version")
bundle=src-tauri/target/universal-apple-darwin/release/bundle
app="$bundle/macos/x-reader.app"
dmg=( "$bundle/dmg/"*"_${version}_"*.dmg )
[[ -d "$app" && ${#dmg[@]} -eq 1 && -f "${dmg[0]}" ]] || {
  echo "Build the universal app and DMG first." >&2; exit 1;
}

lipo -verify_arch arm64 x86_64 "$app/Contents/MacOS/x-reader"
codesign --verify --deep --strict "$app"
mkdir -p release
scratch=$(mktemp -d)
trap 'rm -rf -- "$scratch"' EXIT
portable="$scratch/x-reader Portable"
mkdir "$portable"
ditto "$app" "$portable/x-reader Portable.app"
codesign --verify --deep --strict "$portable/x-reader Portable.app"
touch "$portable/x-reader.portable"
cp docs/PORTABLE-macOS.txt "$portable/README.txt"
cp LICENSE THIRD-PARTY-NOTICES.txt "$portable/"
cat > "$portable/Open x-reader.command" <<'LAUNCHER'
#!/bin/bash
set -eu
folder=$(cd "$(dirname "$0")" && pwd)
exec /usr/bin/open -n "$folder/x-reader Portable.app" --args --portable-home "$folder"
LAUNCHER
chmod 755 "$portable/Open x-reader.command"

prefix="x-reader-$version-macos-universal"
ditto -c -k --sequesterRsrc --keepParent "$portable" "$scratch/portable.zip"
mv "$scratch/portable.zip" "release/$prefix-portable.zip"
cp "${dmg[0]}" "release/$prefix.dmg"
(cd release && shasum -a 256 "$prefix.dmg" "$prefix-portable.zip" > SHA256SUMS-macOS.txt)
