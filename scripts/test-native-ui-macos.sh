#!/bin/bash
# A separate feature-gated binary runs the real WKWebView against packaged
# assets. The already-signed universal application never includes this feature.
set -euo pipefail
repo=$(cd "$(dirname "$0")/.." && pwd)
cd "$repo"
target=aarch64-apple-darwin
cargo build --manifest-path src-tauri/Cargo.toml --release --target "$target" \
  --features custom-protocol,native-ui-smoke --locked
scratch=$(mktemp -d)
pid=''
cleanup() {
  if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
    kill "$pid" || true
    wait "$pid" || true
  fi
  rm -rf -- "$scratch"
}
trap cleanup EXIT
cp "src-tauri/target/$target/release/x-reader" "$scratch/x-reader"
touch "$scratch/x-reader.portable"
"$scratch/x-reader" > "$scratch/session.log" 2>&1 &
pid=$!
for _ in {1..100}; do
  if ! kill -0 "$pid" 2>/dev/null; then
    cat "$scratch/session.log"
    wait "$pid"
    pid=''
    # A native startup failure must never count as a passing run.
    grep -Fxq 'x-reader smoke passed' "$scratch/session.log"
    result=$(sqlite3 "$scratch/data/library.sqlite3" "SELECT json_extract(entry, '$.state.mode'), json_extract(entry, '$.state.pdfPage'), json_array_length(entry, '$.state.bookmarks') FROM shelf;")
    [[ "$result" == 'pdf|2|1' ]]
    exit 0
  fi
  sleep 1
done
cat "$scratch/session.log"
echo 'The WKWebView smoke test timed out.' >&2
exit 1
