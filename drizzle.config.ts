import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

/**
 * drizzle-kit reads this to introspect the live DB and to generate SQL
 * diffs from src/db/schema.ts. Output goes to drizzle/migrations/ (NOT
 * supabase/migrations/) — that way Drizzle's auto-numbered files
 * (0001_*, 0002_*) don't sort before our timestamped Supabase ones.
 *
 * Workflow:
 *   1. Edit src/db/schema.ts.
 *   2. `npm run db:generate` → reviews diff in drizzle/migrations/.
 *   3. Copy/rename to supabase/migrations/<YYYYMMDDHHMMSS>_<name>.sql
 *      (add RLS/RPC/trigger SQL inline if relevant).
 *   4. `supabase db push`.
 *
 * For introspecting an existing DB (one-time baseline or sanity check):
 *   `npm run db:pull`
 */
export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env['DATABASE_URL'] ?? '',
  },
  schemaFilter: ['public'],
  verbose: true,
  strict: true,
});
