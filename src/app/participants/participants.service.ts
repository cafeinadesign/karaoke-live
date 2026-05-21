import { Injectable, inject, signal } from '@angular/core';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { SupabaseService } from '../supabase.service';
import { Participant } from '../types';

interface PresenceMeta {
  readonly user_id: string;
  readonly display_name: string;
  readonly avatar_url: string | null;
  readonly is_host: boolean;
  readonly online_at: string;
}

@Injectable({ providedIn: 'root' })
export class ParticipantsService {
  private readonly supabase = inject(SupabaseService);

  readonly participants = signal<ReadonlyArray<Participant>>([]);
  private channel: RealtimeChannel | null = null;
  private subscribedRoomId: string | null = null;

  async join(roomId: string, me: Participant): Promise<void> {
    if (this.subscribedRoomId === roomId) return;
    await this.leave();

    this.subscribedRoomId = roomId;
    const channel = this.supabase.client.channel(`room-presence:${roomId}`, {
      config: { presence: { key: me.userId } },
    });

    channel.on('presence', { event: 'sync' }, () => this.syncFromChannel(channel));

    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        const meta: PresenceMeta = {
          user_id: me.userId,
          display_name: me.displayName,
          avatar_url: me.avatarUrl,
          is_host: me.isHost,
          online_at: new Date().toISOString(),
        };
        void channel.track(meta);
      }
    });

    this.channel = channel;
  }

  async leave(): Promise<void> {
    if (this.channel) {
      await this.channel.untrack();
      await this.supabase.client.removeChannel(this.channel);
      this.channel = null;
    }
    this.subscribedRoomId = null;
    this.participants.set([]);
  }

  private syncFromChannel(channel: RealtimeChannel): void {
    const state = channel.presenceState<PresenceMeta>();
    const list: Participant[] = [];

    for (const key of Object.keys(state)) {
      const metas = state[key];
      if (metas.length === 0) continue;
      const m = metas[0];
      list.push({
        userId: m.user_id,
        displayName: m.display_name,
        avatarUrl: m.avatar_url,
        isHost: m.is_host,
        onlineAt: m.online_at,
      });
    }

    list.sort((a, b) => {
      if (a.isHost !== b.isHost) return a.isHost ? -1 : 1;
      return a.onlineAt.localeCompare(b.onlineAt);
    });

    this.participants.set(list);
  }
}
