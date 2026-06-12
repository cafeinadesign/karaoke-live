// Promove a migration mais recente gerada pelo drizzle-kit para
// supabase/migrations/ com timestamp no padrão do Supabase CLI.
//
//   npm run db:generate            → drizzle/migrations/000N_xxx.sql
//   node scripts/promote-migration.mjs <nome>
//                                  → supabase/migrations/<ts>_<nome>.sql
//
// Depois: revisar o SQL, acrescentar RLS/RPC/trigger se a mudança pedir,
// e `supabase db push`.

import { promises as fs } from 'node:fs';
import path from 'node:path';

const name = process.argv[2];
if (!name || !/^[a-z0-9_]+$/.test(name)) {
  console.error('uso: node scripts/promote-migration.mjs <nome_em_snake_case>');
  process.exit(1);
}

const drizzleDir = 'drizzle/migrations';
const supabaseDir = 'supabase/migrations';

const entries = (await fs.readdir(drizzleDir).catch(() => []))
  .filter((f) => f.endsWith('.sql'))
  .sort();

if (entries.length === 0) {
  console.error(`nenhum .sql em ${drizzleDir} — rode \`npm run db:generate\` antes.`);
  process.exit(1);
}

const latest = entries[entries.length - 1];
const ts = new Date()
  .toISOString()
  .replace(/[-:TZ]/g, '')
  .slice(0, 14);
const dest = path.join(supabaseDir, `${ts}_${name}.sql`);

await fs.rename(path.join(drizzleDir, latest), dest);
console.log(`✓ ${latest} → ${dest}`);
console.log('revise o SQL (RLS/RPC/triggers à mão) e rode `supabase db push`.');
