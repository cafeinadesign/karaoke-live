import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../supabase.service';
import { VideoResult } from '../types';

interface SearchResponse {
  readonly results: ReadonlyArray<VideoResult>;
}

@Injectable({ providedIn: 'root' })
export class YoutubeService {
  private readonly supabase = inject(SupabaseService);

  async search(query: string): Promise<ReadonlyArray<VideoResult>> {
    const trimmed = query.trim();
    if (!trimmed) return [];

    const { data, error } = await this.supabase.client.functions.invoke<SearchResponse>(
      `youtube-search?q=${encodeURIComponent(trimmed)}`,
      { method: 'GET' },
    );

    if (error || !data) throw new Error(error?.message ?? 'youtube_search_failed');
    return data.results;
  }

  async generateRoast(queueItemId: string): Promise<void> {
    await this.supabase.client.functions.invoke('gemini-roast', {
      method: 'POST',
      body: { queueItemId },
    });
  }
}
