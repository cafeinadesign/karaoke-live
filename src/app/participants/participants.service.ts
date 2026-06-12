import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { SupabaseService } from '../supabase.service';
import { RoomsService } from '../rooms/rooms.service';
import { Participant } from '../types';

const HEARTBEAT_MS = 30_000;
const STALE_AFTER_MS = 90_000;

interface ParticipantRow {
  readonly room_id: string;
  readonly user_id: string;
  readonly display_name: string;
  readonly avatar_url: string | null;
  readonly joined_at: string;
  readonly last_seen_at: string;
}

interface JoinMeta {
  readonly userId: string;
  readonly displayName: string;
  readonly avatarUrl: string | null;
}

/**
 * Source of truth: tabela room_participants.
 * - UPSERT no join, heartbeat de 30s atualiza last_seen_at, DELETE no leave.
 * - Sub via postgres_changes na própria tabela (mesmo motor confiável da queue).
 * - Filtro de zumbis na leitura (last_seen_at > now() - 90s).
 * - isHost é derivado do rooms.currentRoom().host_id em runtime — atualiza
 *   sozinho quando o host transfere o papel (o channel de rooms já sincroniza).
 */
@Injectable({ providedIn: 'root' })
export class ParticipantsService {
  private readonly supabase = inject(SupabaseService);
  private readonly rooms = inject(RoomsService);
  private readonly destroyRef = inject(DestroyRef);

  private readonly rows = signal<ReadonlyArray<ParticipantRow>>([]);

  readonly participants = computed<ReadonlyArray<Participant>>(() => {
    const hostId = this.rooms.currentRoom()?.host_id ?? null;
    const list: Participant[] = this.rows().map((r) => ({
      userId: r.user_id,
      displayName: r.display_name,
      avatarUrl: r.avatar_url,
      isHost: r.user_id === hostId,
      onlineAt: r.last_seen_at,
    }));
    list.sort((a, b) => {
      if (a.isHost !== b.isHost) return a.isHost ? -1 : 1;
      return a.onlineAt.localeCompare(b.onlineAt);
    });
    return list;
  });

  private channel: RealtimeChannel | null = null;
  private subscribedRoomId: string | null = null;
  private currentUserId: string | null = null;
  private heartbeatId: number | null = null;
  private onVisibility: (() => void) | null = null;

  constructor() {
    this.destroyRef.onDestroy(() => { void this.leave(); });
  }

  async join(roomId: string, me: Participant): Promise<void> {
    if (this.subscribedRoomId === roomId && this.currentUserId === me.userId) return;
    await this.leave();

    this.subscribedRoomId = roomId;
    this.currentUserId = me.userId;

    await this.upsertSelf(roomId, {
      userId: me.userId,
      displayName: me.displayName,
      avatarUrl: me.avatarUrl,
    });

    this.channel = this.supabase.client
      .channel(`room-participants:${roomId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'room_participants',
          filter: `room_id=eq.${roomId}`,
        },
        () => { void this.refresh(roomId); },
      )
      .subscribe();

    await this.refresh(roomId);

    this.startHeartbeat(roomId);

    // Aba em background não deve fingir presença: browsers já estrangulam
    // timers ocultos, então pausamos o heartbeat e, ao voltar, batemos na
    // hora — quem reabre reaparece imediato em vez de esperar o próximo tick.
    this.onVisibility = () => {
      if (document.hidden) {
        this.stopHeartbeat();
      } else {
        void this.beat(roomId);
        this.startHeartbeat(roomId);
      }
    };
    document.addEventListener('visibilitychange', this.onVisibility);
  }

  async leave(): Promise<void> {
    this.stopHeartbeat();
    if (this.onVisibility) {
      document.removeEventListener('visibilitychange', this.onVisibility);
      this.onVisibility = null;
    }
    if (this.channel) {
      await this.supabase.client.removeChannel(this.channel);
      this.channel = null;
    }
    if (this.subscribedRoomId && this.currentUserId) {
      await this.supabase.client
        .from('room_participants')
        .delete()
        .eq('room_id', this.subscribedRoomId)
        .eq('user_id', this.currentUserId);
    }
    this.subscribedRoomId = null;
    this.currentUserId = null;
    this.rows.set([]);
  }

  private startHeartbeat(roomId: string): void {
    this.stopHeartbeat();
    this.heartbeatId = window.setInterval(() => {
      void this.beat(roomId);
    }, HEARTBEAT_MS);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatId !== null) {
      window.clearInterval(this.heartbeatId);
      this.heartbeatId = null;
    }
  }

  private async upsertSelf(roomId: string, me: JoinMeta): Promise<void> {
    const now = new Date().toISOString();
    await this.supabase.client.from('room_participants').upsert(
      {
        room_id: roomId,
        user_id: me.userId,
        display_name: me.displayName,
        avatar_url: me.avatarUrl,
        last_seen_at: now,
      },
      { onConflict: 'room_id,user_id' },
    );
  }

  private async beat(roomId: string): Promise<void> {
    if (this.currentUserId !== null) {
      await this.supabase.client
        .from('room_participants')
        .update({ last_seen_at: new Date().toISOString() })
        .eq('room_id', roomId)
        .eq('user_id', this.currentUserId);
    }
  }

  private async refresh(roomId: string): Promise<void> {
    const staleBefore = new Date(Date.now() - STALE_AFTER_MS).toISOString();
    const { data } = await this.supabase.client
      .from('room_participants')
      .select('*')
      .eq('room_id', roomId)
      .gte('last_seen_at', staleBefore)
      .order('joined_at', { ascending: true });
    this.rows.set(data ?? []);
  }
}
