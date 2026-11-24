export interface GeocodeStore {
  get(key: string): Promise<string | null>;
  reserve(): Promise<boolean>;
  save(key: string, address: string): Promise<void>;
}

export async function reverseGeocode(request: Request, store: GeocodeStore): Promise<Response> {
  if (request.method !== 'POST') return new Response(null, { status: 405 });
  try {
    const { latitude, longitude } = await request.json().catch(() => ({})) ?? {};
    if (typeof latitude !== 'number' || typeof longitude !== 'number' ||
        !Number.isFinite(latitude) || !Number.isFinite(longitude) ||
        Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
      return new Response(null, { status: 400 });
    }

    const lat = latitude.toFixed(5);
    const lon = longitude.toFixed(5);
    const key = `pt-BR/${lat},${lon}`;
    const cached = await store.get(key);
    if (cached !== null) return Response.json({ address: cached });
    if (!await store.reserve()) return new Response(null, { status: 429 });

    const url = new URL(process.env['KARAOKE_REVERSE_GEOCODE_URL'] ??
      'https://nominatim.openstreetmap.org/reverse');
    url.search = new URLSearchParams({
      lat, lon, format: 'jsonv2', 'accept-language': 'pt-BR', zoom: '18',
    }).toString();

    const response = await fetch(url, {
      headers: { 'User-Agent': 'KaraokeLive/1.0 (+https://karaoke-live.app.br)' },
      signal: AbortSignal.timeout(4000),
    });
    if (response.status === 404) {
      await store.save(key, '');
      return Response.json({ address: '' });
    }
    if (!response.ok) return new Response(null, { status: 502 });

    const data: { display_name?: unknown } = await response.json();
    const address = typeof data.display_name === 'string' ? data.display_name.trim() : '';
    await store.save(key, address);
    return Response.json({ address });
  } catch {
    return new Response(null, { status: 502 });
  }
}
