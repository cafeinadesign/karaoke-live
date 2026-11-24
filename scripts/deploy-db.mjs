import { spawnSync } from 'node:child_process';

const projectRef = 'nqjzhjosjhlknxpneopd';
const databaseUrl = process.env.KARAOKE_SUPABASE_DB_URL;
let target;

try {
  target = new URL(databaseUrl);
} catch {
  console.error('Configure KARAOKE_SUPABASE_DB_URL nas variáveis de build da produção.');
  process.exit(1);
}

const directHost = target.hostname === `db.${projectRef}.supabase.co`;
const sessionPooler =
  target.hostname.endsWith('.pooler.supabase.com') &&
  target.username === `postgres.${projectRef}`;

if (
  !['postgres:', 'postgresql:'].includes(target.protocol) ||
  (!directHost && !sessionPooler) ||
  (target.port && target.port !== '5432')
) {
  console.error('Use a URL direta ou do Session pooler do projeto Supabase de produção.');
  process.exit(1);
}

const result = spawnSync(
  'npx',
  ['--yes', 'supabase@2.104.0', 'db', 'push', '--db-url', databaseUrl, '--yes'],
  { stdio: 'inherit' },
);
if (result.error) console.error(result.error.message);
process.exit(result.status ?? 1);
