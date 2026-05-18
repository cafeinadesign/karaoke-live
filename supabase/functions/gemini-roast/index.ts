import '@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

interface RequestBody {
  readonly queueItemId: string;
}

interface QueueItemRow {
  readonly id: string;
  readonly video_title: string;
  readonly user_id: string;
}

interface ProfileRow {
  readonly display_name: string | null;
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

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const apiKey = Deno.env.get('GEMINI_API_KEY');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!apiKey || !supabaseUrl || !serviceRoleKey) {
    return new Response(
      JSON.stringify({ error: 'missing_env' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  let body: RequestBody;
  try {
    body = await req.json() as RequestBody;
  } catch {
    return new Response(
      JSON.stringify({ error: 'invalid_json' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  if (!body.queueItemId) {
    return new Response(
      JSON.stringify({ error: 'missing_queueItemId' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const { data: item, error: itemErr } = await supabase
    .from('queue_items')
    .select('id, video_title, user_id')
    .eq('id', body.queueItemId)
    .single<QueueItemRow>();

  if (itemErr || !item) {
    return new Response(
      JSON.stringify({ error: 'queue_item_not_found', detail: itemErr?.message }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name')
    .eq('id', item.user_id)
    .single<ProfileRow>();

  const singer = profile?.display_name ?? 'a próxima vítima do microfone';
  const userPrompt = `Cantor(a): ${singer}\nMúsica: ${item.video_title}\nGere a frase única.`;

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
      { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  const geminiJson = await geminiRes.json() as GeminiResponse;
  const message = geminiJson.candidates?.[0]?.content?.parts?.[0]?.text?.trim()
    ?? `${singer}, sobe no palco. ${item.video_title} não vai cantar sozinha.`;

  const { error: updateErr } = await supabase
    .from('queue_items')
    .update({ gemini_message: message })
    .eq('id', item.id);

  if (updateErr) {
    return new Response(
      JSON.stringify({ error: 'update_failed', detail: updateErr.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  return new Response(JSON.stringify({ message }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
