import { promises as fs } from 'node:fs';
import { existsSync } from 'node:fs';

const OUT_ROOT = 'dist/karaoke-live/browser';
const SRC = 'public/.well-known';

if (!existsSync(SRC)) {
  console.log('no public/.well-known directory; skipping');
  process.exit(0);
}

const DST = `${OUT_ROOT}/.well-known`;
await fs.mkdir(DST, { recursive: true });
await fs.cp(SRC, DST, { recursive: true });
console.log(`✓ copied ${SRC} → ${DST}`);
