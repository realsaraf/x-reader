import { cp, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const distribution = dirname(require.resolve('pdfjs-dist/package.json'));
const destination = fileURLToPath(new URL('../public/pdf-assets/', import.meta.url));
await mkdir(destination, { recursive: true });
await Promise.all(
  ['cmaps', 'iccs', 'standard_fonts', 'wasm', 'LICENSE'].map((entry) =>
    cp(join(distribution, entry), join(destination, entry), { recursive: true }),
  ),
);
