import { Injectable, inject, signal } from '@angular/core';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { SupabaseService } from '../supabase.service';
import { QueueItem, VideoResult } from '../types';

@Injectable({ providedIn: 'root' })
export class QueueService {
  private readonly supabase = inject(SupabaseService);

  readonly items = signal<ReadonlyArray<QueueItem>>([]);
  readonly profileNames = signal<ReadonlyMap<string, string>>(new Map());

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

  /** Host-only: reordena os itens pending da sala. */
  async reorderPending(roomId: string, pendingItemIds: ReadonlyArray<string>): Promise<void> {
    const { error } = await this.supabase.client.rpc('reorder_queue', {
      p_room_id: roomId,
      p_item_ids: [...pendingItemIds],
    });
    if (error) throw new Error(error.message);
  }

  /**
   * Otimista: aplica a nova ordem dos pending no signal local antes da
   * confirmação do servidor. Reatribui as positions atuais (sorted asc) na
   * nova ordem dos IDs — espelha o que o RPC faz no DB.
   * Retorna um snapshot do estado anterior para revert em caso de erro.
   */
  applyPendingReorder(newPendingIdsOrder: ReadonlyArray<string>): ReadonlyArray<QueueItem> {
    const snapshot = this.items();

    const pendingPositions = snapshot
      .filter((i) => i.status === 'pending')
      .map((i) => i.position)
      .sort((a, b) => a - b);

    const idToNewPos = new Map<string, number>();
    newPendingIdsOrder.forEach((id, idx) => {
      const pos = pendingPositions[idx];
      if (pos !== undefined) idToNewPos.set(id, pos);
    });

    const next = snapshot
      .map((item) => {
        const newPos = idToNewPos.get(item.id);
        return newPos !== undefined ? { ...item, position: newPos } : item;
      })
      .sort((a, b) => a.position - b.position);

    this.items.set(next);
    return snapshot;
  }

  /** Restaura um snapshot retornado por applyPendingReorder. */
  restoreSnapshot(snapshot: ReadonlyArray<QueueItem>): void {
    this.items.set(snapshot);
  }

  /** Nome de exibição (cacheado) de quem adicionou a música. */
  displayNameFor(userId: string): string {
    return this.profileNames().get(userId) ?? '…';
  }

  private async refresh(roomId: string): Promise<void> {
    const { data } = await this.supabase.client
      .from('queue_items')
      .select('*')
      .eq('room_id', roomId)
      .order('position', { ascending: true });
    const items = data ?? [];
    this.items.set(items);
    await this.ensureProfileNames(items.map((i) => i.user_id));
  }

  private async ensureProfileNames(userIds: ReadonlyArray<string>): Promise<void> {
    const current = this.profileNames();
    const missing = [...new Set(userIds)].filter((id) => !current.has(id));
    if (missing.length === 0) return;

    const { data } = await this.supabase.client
      .from('profiles')
      .select('id, display_name')
      .in('id', missing);
    if (!data || data.length === 0) return;

    const next = new Map(current);
    for (const p of data) {
      if (p.display_name) next.set(p.id, p.display_name);
    }
    this.profileNames.set(next);
  }
}
