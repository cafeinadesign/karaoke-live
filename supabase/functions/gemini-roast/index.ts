import '@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq } from 'drizzle-orm';
import postgres from 'postgres';
import { corsHeadersFor } from '../_shared/cors.ts';
import { profiles, queueItems } from '../../../src/db/schema.ts';

interface RequestBody {
  readonly queueItemId: string;
}

interface GeminiPart {
  readonly text: string;
}

interface GeminiResponse {
  readonly candidates?: ReadonlyArray<{
    readonly content?: { readonly parts?: ReadonlyArray<GeminiPart> };
  }>;
}

const PROMPT_SYSTEM = `Você é um locutor de karaokê com humor motivacional irônico, em português do Brasil. Quando alguém vai cantar, você produz UMA frase curta (máximo 25 palavras) que mistura provocação leve com encorajamento. Sem palavrões, sem ofensas pesadas, sem clichês motivacionais batidos. Use o nome da pessoa e da música. Tom: "você não canta tão bem, mas vai com tudo".`;

// Connection per cold start. postgres.js handles pooling internally; we use
// the Supabase transaction pooler (port 6543) for short-lived edge calls,
// which requires prepare: false because PREPARE doesn't survive across
// transactions in transaction-mode pooling.
let cachedDb: ReturnType<typeof drizzle> | null = null;
function getDb(databaseUrl: string) {
  if (cachedDb) return cachedDb;
  const sql = postgres(databaseUrl, { prepare: false });
  cachedDb = drizzle(sql);
  return cachedDb;
}

Deno.serve(async (req: Request): Promise<Response> => {
  const cors = corsHeadersFor(req);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: cors });
  }

  const apiKey = Deno.env.get('GEMINI_API_KEY');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const databaseUrl = Deno.env.get('DATABASE_URL');
  if (!apiKey || !supabaseUrl || !anonKey || !databaseUrl) {
    return new Response(
      JSON.stringify({ error: 'env_missing' }),
      { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } },
    );
  }

  // Exige um usuário REAL (não só a anon key).
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) {
    return new Response(
      JSON.stringify({ error: 'unauthorized' }),
      { status: 401, headers: { ...cors, 'Content-Type': 'application/json' } },
    );
  }

  let body: RequestBody;
  try {
    body = await req.json() as RequestBody;
  } catch {
    return new Response(
      JSON.stringify({ error: 'invalid_json' }),
      { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } },
    );
  }

  if (!body.queueItemId) {
    return new Response(
      JSON.stringify({ error: 'missing_queueItemId' }),
      { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } },
    );
  }

  const db = getDb(databaseUrl);

  const [item] = await db
    .select({
      id: queueItems.id,
      videoTitle: queueItems.videoTitle,
      userId: queueItems.userId,
    })
    .from(queueItems)
    .where(eq(queueItems.id, body.queueItemId))
    .limit(1);

  if (!item) {
    return new Response(
      JSON.stringify({ error: 'queue_item_not_found' }),
      { status: 404, headers: { ...cors, 'Content-Type': 'application/json' } },
    );
  }

  const [profile] = await db
    .select({ displayName: profiles.displayName })
    .from(profiles)
    .where(eq(profiles.id, item.userId))
    .limit(1);

  const singer = profile?.displayName ?? 'a próxima vítima do microfone';
  const userPrompt = `Cantor(a): ${singer}\nMúsica: ${item.videoTitle}\nGere a frase única.`;

  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
  const geminiRes = await fetch(geminiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: PROMPT_SYSTEM }] },
      contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
      generationConfig: { temperature: 0.95, maxOutputTokens: 80 },
    }),
  });

  if (!geminiRes.ok) {
    const detail = await geminiRes.text();
    return new Response(
      JSON.stringify({ error: 'gemini_failed', detail }),
      { status: 502, headers: { ...cors, 'Content-Type': 'application/json' } },
    );
  }

  const geminiJson = await geminiRes.json() as GeminiResponse;
  const message = geminiJson.candidates?.[0]?.content?.parts?.[0]?.text?.trim()
    ?? `${singer}, sobe no palco. ${item.videoTitle} não vai cantar sozinha.`;

  await db
    .update(queueItems)
    .set({ geminiMessage: message })
    .where(eq(queueItems.id, item.id));

  return new Response(JSON.stringify({ message }), {
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
});
