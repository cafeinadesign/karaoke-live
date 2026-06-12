// Bump sincronizado de versão: package.json (versionName) + twa-manifest.json
// do projeto Android (appVersionName + appVersionCode++).
//
//   node scripts/bump-version.mjs patch|minor|major
//
// O TWA mora em outro repo (../karaoke-live-android por padrão); aponte
// TWA_DIR se estiver em outro lugar. Sem o manifest, o script bumpa só o
// package.json e avisa.

import { promises as fs } from 'node:fs';
import path from 'node:path';

const kind = process.argv[2];
if (!['patch', 'minor', 'major'].includes(kind)) {
  console.error('uso: node scripts/bump-version.mjs patch|minor|major');
  process.exit(1);
}

const pkgPath = 'package.json';
const pkg = JSON.parse(await fs.readFile(pkgPath, 'utf8'));
const [maj, min, pat] = pkg.version.split('.').map(Number);
const next =
  kind === 'major' ? `${maj + 1}.0.0`
  : kind === 'minor' ? `${maj}.${min + 1}.0`
  : `${maj}.${min}.${pat + 1}`;

pkg.version = next;
await fs.writeFile(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
console.log(`✓ package.json ${maj}.${min}.${pat} → ${next}`);

const twaPath = path.join(process.env.TWA_DIR ?? '../karaoke-live-android', 'twa-manifest.json');
try {
  const twa = JSON.parse(await fs.readFile(twaPath, 'utf8'));
  twa.appVersionName = next;
  twa.appVersionCode = (twa.appVersionCode ?? 0) + 1;
  await fs.writeFile(twaPath, JSON.stringify(twa, null, 2) + '\n');
  console.log(`✓ ${twaPath} → versionName ${next}, versionCode ${twa.appVersionCode}`);
  console.log('lembre de rebuildar o AAB: bubblewrap build');
} catch {
  console.warn(`⚠ ${twaPath} não encontrado — só o package.json foi bumpado.`);
}
