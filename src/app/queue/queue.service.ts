import { Injectable, inject, signal } from '@angular/core';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { SupabaseService } from '../supabase.service';
import { QueueItem, VideoResult } from '../types';

@Injectable({ providedIn: 'root' })
export class QueueService {
  private readonly supabase = inject(SupabaseService);

  readonly items = signal<ReadonlyArray<QueueItem>>([]);
  private channel: RealtimeChannel | null = null;
  private subscribedRoomId: string | null = null;

  async subscribe(roomId: string): Promise<void> {
    if (this.subscribedRoomId === roomId) return;
    await this.unsubscribe();

    await this.refresh(roomId);

    this.subscribedRoomId = roomId;
    this.channel = this.supabase.client
      .channel(`queue:${roomId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'queue_items', filter: `room_id=eq.${roomId}` },
        () => { void this.refresh(roomId); },
      )
      .subscribe();
  }

  async unsubscribe(): Promise<void> {
    if (this.channel) {
      await this.supabase.client.removeChannel(this.channel);
      this.channel = null;
    }
    this.subscribedRoomId = null;
    this.items.set([]);
  }

  async enqueue(roomId: string, video: VideoResult): Promise<QueueItem> {
    const { data, error } = await this.supabase.client.rpc('enqueue_item', {
      p_room_id: roomId,
      p_video_id: video.videoId,
      p_video_title: video.title,
      p_video_thumbnail: video.thumbnail,
      p_video_duration_seconds: video.durationSeconds,
    });
    if (error || !data) throw new Error(error?.message ?? 'enqueue_failed');
    return data;
  }

  async advanceNext(roomId: string): Promise<QueueItem | null> {
    const { data, error } = await this.supabase.client.rpc('advance_queue', {
      p_room_id: roomId,
    });
    if (error) throw new Error(error.message);
    return data;
  }

  async removeItem(id: string): Promise<void> {
    const { error } = await this.supabase.client
      .from('queue_items')
      .delete()
      .eq('id', id);
    if (error) throw new Error(error.message);
  }

  private async refresh(roomId: string): Promise<void> {
    const { data } = await this.supabase.client
      .from('queue_items')
      .select('*')
      .eq('room_id', roomId)
      .order('position', { ascending: true });
    this.items.set(data ?? []);
  }
}
