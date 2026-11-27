# Releasing x-reader

Each release contains a Windows x64 installer, a universal macOS disk image, a portable ZIP for each platform and SHA-256 checksums. A push to `main` runs the Windows build. The release action builds both platforms and publishes the downloads together.

## Publish from GitHub

1. For the first release, use the version already in `main`. For a later release, update the version on your development machine and commit the changed manifests and lockfiles.

   ```sh
   node scripts/set-version.mjs 0.2.0
   git add package.json package-lock.json src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/tauri.conf.json
   git commit -m "Release x-reader 0.2.0"
   git push origin main
   ```

2. Open [Actions → Release x-reader](https://github.com/realsaraf/x-reader/actions/workflows/release.yml). Click **Run workflow**, select `main`, leave **Publish the finished release immediately** checked, then click **Run workflow**. Clear the box if you want to edit the release notes in a draft first.
3. The workflow tests the app, builds the four downloads, verifies their checksums, and attaches them to a release named after the checked-in version. Open [Releases](https://github.com/realsaraf/x-reader/releases) to find the downloads.

With the GitHub CLI, run `gh workflow run release.yml --ref main -f publish=true`. The workflow uses GitHub's repository token. Maintainers need write access and Actions must be enabled. Organisation rules must allow the release job to write repository contents. [GitHub workflow guide](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow)

If a build fails, open its job log and fix the first failing step. You can rerun a failed upload against its original commit and draft. A published version keeps its existing assets. Publish changes under a new version.

## Build both downloads on Windows

Install the [Tauri Windows prerequisites](https://v2.tauri.app/start/prerequisites/) and Node.js 24. From an x64 Windows checkout, run these commands in PowerShell.

```powershell
npm ci
npm test
cargo test --manifest-path src-tauri/Cargo.toml --locked
npm run tauri -- build --bundles nsis
./scripts/package-windows.ps1
```

The `release` directory will contain the installer, portable ZIP, and `SHA256SUMS.txt`. Use `Get-FileHash -Algorithm SHA256 <download>` to compare a file with its published checksum.

| Download | How to run it | Library location |
| --- | --- | --- |
| Windows installer | Run the setup EXE and open x-reader from Start | `%LOCALAPPDATA%\io.github.realsaraf.xreader\library.sqlite3` |
| Windows portable | Extract the entire ZIP to a writable folder, then open `x-reader.exe` | `data\library.sqlite3` beside the executable |

The installer can download Microsoft's WebView2 runtime on first setup when it is missing. The portable copy uses the WebView2 runtime already installed on the PC. Keep its `x-reader.portable` marker and `data` folder when moving or upgrading it. Close the app before copying a library. [Tauri Windows installer guide](https://v2.tauri.app/distribute/windows-installer/)

These builds are unsigned. Windows may display a SmartScreen prompt on first use.

## Build the universal macOS downloads

On a Mac, install Xcode Command Line Tools, Rust and Node.js 24. The deployment target is macOS 15 or newer. Both the DMG and ZIP include native Apple Silicon and Intel executables in one app bundle.

```sh
rustup target add aarch64-apple-darwin x86_64-apple-darwin
npm ci
MACOSX_DEPLOYMENT_TARGET=15.0 npm run tauri -- build --target universal-apple-darwin --bundles app,dmg
bash scripts/package-macos.sh
bash scripts/verify-macos.sh
```

The verification script checks both CPU architectures and the code signature, mounts the DMG, and launches the extracted portable app with an isolated library. On GitHub you can run **Actions → macOS universal build → Run workflow** to build and verify macOS downloads independently.

| Download | How to run it | Library location |
| --- | --- | --- |
| macOS DMG | Mount the image, drag x-reader to Applications, then open it | `~/Library/Application Support/io.github.realsaraf.xreader/library.sqlite3` |
| macOS portable | Extract and move the whole folder to a writable location, then open x-reader Portable.app | `data/library.sqlite3` beside the app bundle |

The portable folder includes **Open x-reader.command** for first launches where Finder isolates the app in a temporary location. It passes the folder path through Launch Services so the app can locate your library. The app bundle retains its signature when moved.

The default macOS build is ad hoc signed. It has no Apple Developer ID notarization. If macOS blocks a trusted download, use the first-open control in **System Settings → Privacy & Security**. Maintainers with Apple credentials can configure Developer ID signing and notarization using Tauri's signing guide. [Apple first-open guidance](https://support.apple.com/en-us/102445) · [Tauri macOS signing guide](https://v2.tauri.app/distribute/sign/macos/)
