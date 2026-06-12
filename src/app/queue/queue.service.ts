import { Injectable, inject, signal } from '@angular/core';
import type {
  RealtimeChannel,
  RealtimePostgresChangesPayload,
} from '@supabase/supabase-js';
import { SupabaseService } from '../supabase.service';
import { QueueItem, VideoResult } from '../types';

type QueueChange = RealtimePostgresChangesPayload<QueueItem>;

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

    this.subscribedRoomId = roomId;
    this.channel = this.supabase.client
      .channel(`queue:${roomId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'queue_items', filter: `room_id=eq.${roomId}` },
        (payload) => { this.applyChange(payload as QueueChange); },
      )
      // O callback roda em TODO join bem-sucedido (incluindo rejoins após
      // queda de rede) — o refetch cobre os eventos perdidos no gap.
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') void this.refresh(roomId);
      });
  }

  async unsubscribe(): Promise<void> {
    if (this.channel) {
      await this.supabase.client.removeChannel(this.channel);
      this.channel = null;
    }
    this.subscribedRoomId = null;
    this.items.set([]);
    // Sala nova = elenco novo; sem isso o cache cresceria sem limite.
    this.profileNames.set(new Map());
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
    return data as QueueItem;
  }

  async advanceNext(roomId: string): Promise<QueueItem | null> {
    const { data, error } = await this.supabase.client.rpc('advance_queue', {
      p_room_id: roomId,
    });
    if (error) throw new Error(error.message);
    return data as QueueItem | null;
  }

  async removeItem(id: string): Promise<void> {
    const { error } = await this.supabase.client
      .from('queue_items')
      .delete()
      .eq('id', id);
    if (error) throw new Error(error.message);
  }

  /** Dono do item troca a música escolhida sem perder a vez. */
  async replaceItemVideo(itemId: string, video: VideoResult): Promise<QueueItem> {
    const { data, error } = await this.supabase.client.rpc('replace_queue_item_video', {
      p_item_id: itemId,
      p_video_id: video.videoId,
      p_video_title: video.title,
      p_video_thumbnail: video.thumbnail,
      p_video_duration_seconds: video.durationSeconds,
    });
    if (error || !data) throw new Error(error?.message ?? 'replace_failed');
    return data as QueueItem;
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

  /**
   * Aplica o evento do Realtime direto no signal, sem refetch — um UPDATE de
   * heartbeat alheio não custa mais um round-trip da fila inteira. Gaps de
   * reconexão são cobertos pelo refetch no SUBSCRIBED.
   */
  private applyChange(payload: QueueChange): void {
    switch (payload.eventType) {
      case 'INSERT': {
        const item = payload.new;
        this.items.update((curr) =>
          [...curr.filter((i) => i.id !== item.id), item].sort(
            (a, b) => a.position - b.position,
          ),
        );
        void this.ensureProfileNames([item.user_id]);
        break;
      }
      case 'UPDATE': {
        const item = payload.new;
        this.items.update((curr) =>
          curr
            .map((i) => (i.id === item.id ? item : i))
            .sort((a, b) => a.position - b.position),
        );
        break;
      }
      case 'DELETE': {
        // Com REPLICA IDENTITY default, o old traz só a PK.
        const oldId = (payload.old as Partial<QueueItem>).id;
        if (oldId) {
          this.items.update((curr) => curr.filter((i) => i.id !== oldId));
        }
        break;
      }
    }
  }

  private async refresh(roomId: string): Promise<void> {
    const { data } = await this.supabase.client
      .from('queue_items')
      .select('*')
      .eq('room_id', roomId)
      .order('position', { ascending: true });
    const items = (data ?? []) as QueueItem[];
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
