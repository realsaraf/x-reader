import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const version = process.argv[2];
if (
  !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version ?? '') ||
  version.split('.').some((component) => Number(component) > 65535)
) {
  throw new Error('Use a Windows-compatible version such as 0.2.0 (components 0–65535).');
}

const read = (path) => readFileSync(resolve(root, path), 'utf8');
const changes = new Map();
for (const path of ['package.json', 'package-lock.json', 'src-tauri/tauri.conf.json']) {
  const current = read(path);
  const parsed = JSON.parse(current);
  if (path === 'package-lock.json') {
    parsed.version = version;
    parsed.packages[''].version = version;
    changes.set(path, JSON.stringify(parsed, null, 2) + '\n');
  } else {
    changes.set(
      path,
      current.replace(/("version":\s*")[^"]+"/, (_, prefix) => prefix + version + '"'),
    );
  }
}
for (const path of ['src-tauri/Cargo.toml', 'src-tauri/Cargo.lock']) {
  const current = read(path);
  const pattern = /(name = "x-reader"\r?\nversion = ")[^"]+"/;
  if (!pattern.test(current)) throw new Error('Missing x-reader package in ' + path);
  changes.set(
    path,
    current.replace(pattern, (_, prefix) => prefix + version + '"'),
  );
}
for (const [path, content] of changes) writeFileSync(resolve(root, path), content);
console.log('x-reader version ' + version);
