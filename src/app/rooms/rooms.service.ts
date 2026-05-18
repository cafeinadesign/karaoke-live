import { Injectable, inject, signal } from '@angular/core';
import { SupabaseService } from '../supabase.service';
import { AuthService } from '../auth/auth.service';
import { Room } from '../types';

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

  async createRoom(name: string | null): Promise<Room> {
    const userId = this.auth.user()?.id;
    if (!userId) throw new Error('not_authenticated');

    for (let attempt = 0; attempt < 5; attempt++) {
      const code = generateCode();
      const { data, error } = await this.supabase.client
        .from('rooms')
        .insert({ code, host_id: userId, name })
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
}
