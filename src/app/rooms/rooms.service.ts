import { Injectable, inject, signal } from '@angular/core';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { SupabaseService } from '../supabase.service';
import { AuthService } from '../auth/auth.service';
import { NewRoom, Room } from '../types';

export type RoomSummary = Pick<
  Room,
  | 'id'
  | 'code'
  | 'ended_at'
  | 'host_id'
  | 'name'
  | 'scheduled_at'
  | 'scheduled_end_at'
  | 'event_timezone'
  | 'started_at'
  | 'is_public'
  | 'venue_name'
  | 'latitude'
  | 'longitude'
>;

export interface RoomMembership {
  readonly left_at: string | null;
  readonly rooms: RoomSummary;
}

const ROOM_SUMMARY_COLUMNS =
  'id, code, ended_at, host_id, name, scheduled_at, scheduled_end_at, event_timezone, started_at, is_public, venue_name, latitude, longitude';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateCode(): string {
  let out = '';
  for (let i = 0; i < 6; i++) {
    out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return out;
}

@Injectable({ providedIn: 'root' })
export class RoomsService {
  private readonly supabase = inject(SupabaseService);
  private readonly auth = inject(AuthService);

  readonly currentRoom = signal<Room | null>(null);
  private roomChannel: RealtimeChannel | null = null;
  private watchedRoomId: string | null = null;

  async listMemberships(userId: string): Promise<RoomMembership[]> {
    const { data, error } = await this.supabase.client
      .from('room_memberships')
      .select(`left_at, rooms!inner(${ROOM_SUMMARY_COLUMNS})`)
      .eq('user_id', userId)
      .order('last_joined_at', { ascending: false });

    if (error) throw new Error(error.message);
    return data;
  }

  async listPublicRooms(): Promise<RoomSummary[]> {
    const { data, error } = await this.supabase.client
      .from('rooms')
      .select(ROOM_SUMMARY_COLUMNS)
      .eq('is_public', true)
      .is('ended_at', null)
      .order('scheduled_at', { ascending: true, nullsFirst: false })
      .limit(50);

    if (error) throw new Error(error.message);
    return data ?? [];
  }

  async leaveMembership(roomId: string): Promise<void> {
    const { error } = await this.supabase.client.rpc('leave_room_membership', {
      p_room_id: roomId,
    });
    if (error) throw new Error(error.message);
  }

  async createRoom(room: NewRoom): Promise<Room> {
    const userId = this.auth.user()?.id;
    if (!userId) throw new Error('not_authenticated');

    const isScheduled = Boolean(room.scheduled_at);
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = generateCode();
      const { data, error } = await this.supabase.client
        .from('rooms')
        .insert({
          ...room,
          code,
          host_id: userId,
          is_public: room.is_public ?? false,
          started_at:
            room.started_at !== undefined
              ? room.started_at
              : isScheduled
                ? null
                : new Date().toISOString(),
        })
        .select()
        .single();

      if (!error && data) {
        this.currentRoom.set(data);
        return data;
      }
      if (error && !error.message.includes('rooms_code_key')) {
        throw new Error(error.message);
      }
    }
    throw new Error('could_not_generate_code');
  }

  async joinByCode(code: string): Promise<Room> {
    const normalized = code.trim().toUpperCase();
    const { data, error } = await this.supabase.client
      .from('rooms')
      .select('*')
      .eq('code', normalized)
      .is('ended_at', null)
      .single();

    if (error || !data) throw new Error('room_not_found');
    this.currentRoom.set(data);
    return data;
  }

  async loadRoomById(roomId: string): Promise<Room | null> {
    const { data } = await this.supabase.client
      .from('rooms')
      .select('*')
      .eq('id', roomId)
      .single();
    this.currentRoom.set(data);
    return data;
  }

  /** Keeps currentRoom in sync with remote changes (e.g. host transfer). */
  async watchRoom(roomId: string): Promise<void> {
    if (this.watchedRoomId === roomId) return;
    if (this.roomChannel) await this.unwatchRoom();

    this.watchedRoomId = roomId;
    this.roomChannel = this.supabase.client
      .channel(`room:${roomId}:${crypto.randomUUID()}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` },
        (payload) => {
          this.currentRoom.set(payload.new as Room);
        },
      )
      .subscribe();
  }

  async unwatchRoom(): Promise<void> {
    if (this.roomChannel) {
      await this.supabase.client.removeChannel(this.roomChannel);
      this.roomChannel = null;
    }
    this.watchedRoomId = null;
  }

  /** Hands the host role to another participant. Only the current host may call this. */
  async transferHost(roomId: string, newHostId: string, leave = false): Promise<void> {
    const { data, error } = await this.supabase.client.rpc('transfer_room_host', {
      p_room_id: roomId,
      p_new_host_id: newHostId,
      p_leave: leave,
    });
    if (error || !data) throw new Error(error?.message ?? 'transfer_failed');
    this.currentRoom.set(data);
  }

  /** Marks a scheduled event room as live. Only the host may call this. */
  async startRoom(roomId: string): Promise<Room> {
    const { data, error } = await this.supabase.client.rpc('start_room', {
      p_room_id: roomId,
    });
    if (error || !data) throw new Error(error?.message ?? 'start_failed');
    this.currentRoom.set(data);
    return data;
  }

  /** Marks the room as ended. */
  async endRoom(roomId: string): Promise<void> {
    const { error } = await this.supabase.client
      .from('rooms')
      .update({ ended_at: new Date().toISOString() })
      .eq('id', roomId);
    if (error) throw new Error(error.message);
  }
}
