import '@supabase/functions-js/edge-runtime.d.ts';
import { corsHeaders } from '../_shared/cors.ts';

interface YouTubeSearchItem {
  readonly id: { readonly videoId: string };
  readonly snippet: {
    readonly title: string;
    readonly channelTitle: string;
    readonly thumbnails: {
      readonly medium?: { readonly url: string };
      readonly high?: { readonly url: string };
      readonly default?: { readonly url: string };
    };
  };
}

interface YouTubeVideoItem {
  readonly id: string;
  readonly contentDetails: { readonly duration: string };
}

interface VideoResult {
  readonly videoId: string;
  readonly title: string;
  readonly channelTitle: string;
  readonly thumbnail: string;
  readonly durationSeconds: number;
}

function parseIsoDuration(iso: string): number {
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  const [, h, m, s] = match;
  return (Number(h ?? 0) * 3600) + (Number(m ?? 0) * 60) + Number(s ?? 0);
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const apiKey = Deno.env.get('YOUTUBE_API_KEY');
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: 'YOUTUBE_API_KEY not configured' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  const url = new URL(req.url);
  const query = url.searchParams.get('q')?.trim();
  if (!query) {
    return new Response(
      JSON.stringify({ error: 'missing q parameter' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  const searchUrl = new URL('https://www.googleapis.com/youtube/v3/search');
  searchUrl.searchParams.set('part', 'snippet');
  searchUrl.searchParams.set('type', 'video');
  searchUrl.searchParams.set('videoEmbeddable', 'true');
  searchUrl.searchParams.set('maxResults', '15');
  searchUrl.searchParams.set('q', `${query} karaoke`);
  searchUrl.searchParams.set('key', apiKey);

  const searchRes = await fetch(searchUrl);
  if (!searchRes.ok) {
    const detail = await searchRes.text();
    return new Response(
      JSON.stringify({ error: 'youtube_search_failed', detail }),
      { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  const searchJson = await searchRes.json() as { readonly items: ReadonlyArray<YouTubeSearchItem> };
  const videoIds = searchJson.items.map((i) => i.id.videoId).filter(Boolean);

  if (videoIds.length === 0) {
    return new Response(JSON.stringify({ results: [] }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const detailsUrl = new URL('https://www.googleapis.com/youtube/v3/videos');
  detailsUrl.searchParams.set('part', 'contentDetails');
  detailsUrl.searchParams.set('id', videoIds.join(','));
  detailsUrl.searchParams.set('key', apiKey);

  const detailsRes = await fetch(detailsUrl);
  const detailsJson = await detailsRes.json() as { readonly items: ReadonlyArray<YouTubeVideoItem> };
  const durations = new Map<string, number>(
    detailsJson.items.map((v) => [v.id, parseIsoDuration(v.contentDetails.duration)]),
  );

  const results: ReadonlyArray<VideoResult> = searchJson.items.map((item) => {
    const thumb = item.snippet.thumbnails.medium?.url
      ?? item.snippet.thumbnails.high?.url
      ?? item.snippet.thumbnails.default?.url
      ?? '';
    return {
      videoId: item.id.videoId,
      title: item.snippet.title,
      channelTitle: item.snippet.channelTitle,
      thumbnail: thumb,
      durationSeconds: durations.get(item.id.videoId) ?? 0,
    };
  });

  return new Response(JSON.stringify({ results }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
