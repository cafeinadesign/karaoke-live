/** Origens permitidas a chamar as edge functions. */
const ALLOWED_ORIGINS: ReadonlySet<string> = new Set([
  'https://karaoke-live.app.br',
  'http://localhost:4200',
  'http://localhost:4000',
]);

const DEFAULT_ORIGIN = 'https://karaoke-live.app.br';

/**
 * CORS headers com Allow-Origin específico (não `*`). Ecoa o Origin do request
 * se estiver no allowlist; senão usa o domínio de produção como fallback.
 * `Vary: Origin` evita que caches devolvam a resposta de uma origem para outra.
 */
export function corsHeadersFor(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin') ?? '';
  const allowOrigin = ALLOWED_ORIGINS.has(origin) ? origin : DEFAULT_ORIGIN;
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Headers':
      'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Vary': 'Origin',
  };
}
