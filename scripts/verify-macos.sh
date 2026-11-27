#!/bin/bash
# Verify the exact downloads that will be attached to the release.
set -euo pipefail
repo=$(cd "$(dirname "$0")/.." && pwd)
cd "$repo"
version=$(node -p "require('./package.json').version")
prefix="release/x-reader-$version-macos-universal"
(cd release && shasum -a 256 -c SHA256SUMS-macOS.txt)
scratch=$(mktemp -d)
mount="$scratch/disk"
mounted=false
pid=''
cleanup() {
  if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
    kill "$pid" || true
    wait "$pid" || true
  fi
  if [[ "$mounted" == true ]]; then hdiutil detach "$mount"; fi
  rm -rf -- "$scratch"
}
trap cleanup EXIT
mkdir "$mount"
hdiutil attach -readonly -nobrowse -mountpoint "$mount" "$prefix.dmg"
mounted=true
codesign --verify --deep --strict "$mount/x-reader.app"
lipo -verify_arch arm64 x86_64 "$mount/x-reader.app/Contents/MacOS/x-reader"
hdiutil detach "$mount"
mounted=false

ditto -x -k "$prefix-portable.zip" "$scratch"
portable="$scratch/x-reader Portable"
app="$portable/x-reader Portable.app"
test -x "$portable/Open x-reader.command"
test -f "$portable/x-reader.portable"
codesign --verify --deep --strict "$app"
"$app/Contents/MacOS/x-reader" &
pid=$!
database="$portable/data/library.sqlite3"
for _ in {1..60}; do
  kill -0 "$pid"
  if [[ -f "$database" ]] && [[ "$(sqlite3 "$database" 'PRAGMA user_version;')" == 1 ]]; then
    sqlite3 "$database" 'SELECT count(*) FROM shelf;'
    exit 0
  fi
  sleep 1
done
echo 'The packaged app did not initialize its portable library.' >&2
exit 1
