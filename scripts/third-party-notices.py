"""Collect distributable license texts from the locked JS and Rust dependency trees."""
from collections import defaultdict
import json
from pathlib import Path
import re
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
licenses = defaultdict(set)
inventory = set()


def collect(name, version, license_id, directory, extra=()):
    entry = f"{name} {version}"
    inventory.add(f"{entry}  |  {license_id or 'See upstream license'}")
    candidates = list(directory.iterdir()) + list(extra)
    for path in sorted(candidates):
        if path.is_dir() and path.name.lower() in {"licenses", "license"}:
            candidates.extend(path.glob("*"))
    for path in candidates:
        if not path.is_file() or not re.match(r"^(licen[cs]e|licen[cs]ing|copying|notice|copyright|ofl|unlicense|apache|mit)(\b|[_-])", path.name, re.I):
            continue
        body = "\n".join(line.rstrip() for line in path.read_text(encoding="utf-8", errors="replace").splitlines()).strip()
        if body:
            licenses[body].add(entry)


def command(*args):
    return subprocess.check_output(args, cwd=ROOT, encoding="utf-8")


npm = "npm.cmd" if sys.platform == "win32" else "npm"
paths = command(npm, "ls", "--omit=dev", "--all", "--parseable").splitlines()
for name in paths:
    directory = Path(name)
    if directory == ROOT or not (directory / 'package.json').is_file():
        continue
    meta = json.loads((directory / "package.json").read_text(encoding="utf-8"))
    extra = []
    if meta["name"] in {"pdfjs-dist", "foliate-js"}:
        extra = list(directory.rglob("LICENSE*")) + list(directory.rglob("COPYING*"))
    collect(meta["name"], meta["version"], meta.get("license"), directory, extra)

seen = set()
for target in ["x86_64-pc-windows-msvc", "aarch64-apple-darwin", "x86_64-apple-darwin"]:
    rust = json.loads(command("cargo", "metadata", "--locked", "--format-version", "1", "--filter-platform",
                              target, "--manifest-path", "src-tauri/Cargo.toml"))
    for crate in rust["packages"]:
        if crate["source"] and crate["id"] not in seen:
            collect(crate["name"], crate["version"], crate["license"], Path(crate["manifest_path"]).parent)
            seen.add(crate["id"])

output = ["x-reader | Third-party notices", "",
          "Dependency inventory for the Windows and macOS distributions and their build tools.",
          "Third-party software and fonts retain their respective licenses.", ""]
output.extend(sorted(inventory, key=str.lower))
for body, packages in sorted(licenses.items(), key=lambda group: sorted(group[1])):
    output.extend(["", "=" * 72, ", ".join(sorted(packages)), "=" * 72, "", body])
(ROOT / "THIRD-PARTY-NOTICES.txt").write_bytes(("\n".join(output) + "\n").encode("utf-8"))
