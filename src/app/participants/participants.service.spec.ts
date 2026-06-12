import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, beforeEach, expect, it } from 'vitest';
import { ParticipantsService } from './participants.service';
import { RoomsService } from '../rooms/rooms.service';
import { SupabaseService } from '../supabase.service';
import { Room } from '../types';

const room: Room = {
  id: 'room-1',
  code: 'ABC123',
  host_id: 'user-host',
  name: 'Sala Teste',
  current_item_id: null,
  created_at: '2026-06-12T00:00:00Z',
  ended_at: null,
  latitude: 0,
  longitude: 0,
};

function row(userId: string, lastSeenAt: string) {
  return {
    room_id: 'room-1',
    user_id: userId,
    display_name: `Nome ${userId}`,
    avatar_url: null,
    joined_at: '2026-06-12T00:00:00Z',
    last_seen_at: lastSeenAt,
  };
}

describe('ParticipantsService (computed participants)', () => {
  let service: ParticipantsService;
  let currentRoom: ReturnType<typeof signal<Room | null>>;

  beforeEach(() => {
    currentRoom = signal<Room | null>(room);
    TestBed.configureTestingModule({
      providers: [
        ParticipantsService,
        { provide: SupabaseService, useValue: { client: {} } },
        { provide: RoomsService, useValue: { currentRoom } },
      ],
    });
    service = TestBed.inject(ParticipantsService);
  });

  function setRows(rows: ReadonlyArray<ReturnType<typeof row>>): void {
    // rows é private — o caminho público passa por join()+refresh(), que exige
    // um client Supabase real. Aqui interessa só a derivação do computed.
    (service as unknown as { rows: ReturnType<typeof signal> }).rows.set(rows);
  }

  it('host vem primeiro, demais por ordem de chegada', () => {
    setRows([
      row('user-late', '2026-06-12T00:03:00Z'),
      row('user-early', '2026-06-12T00:01:00Z'),
      row('user-host', '2026-06-12T00:02:00Z'),
    ]);

    expect(service.participants().map((p) => p.userId)).toEqual([
      'user-host',
      'user-early',
      'user-late',
    ]);
  });

  it('isHost deriva do host_id da sala atual', () => {
    setRows([row('user-host', '2026-06-12T00:01:00Z'), row('user-b', '2026-06-12T00:02:00Z')]);

    const flags = new Map(service.participants().map((p) => [p.userId, p.isHost]));
    expect(flags.get('user-host')).toBe(true);
    expect(flags.get('user-b')).toBe(false);
  });

  it('isHost acompanha a transferência de host sem re-fetch', () => {
    setRows([row('user-host', '2026-06-12T00:01:00Z'), row('user-b', '2026-06-12T00:02:00Z')]);

    currentRoom.set({ ...room, host_id: 'user-b' });

    const flags = new Map(service.participants().map((p) => [p.userId, p.isHost]));
    expect(flags.get('user-host')).toBe(false);
    expect(flags.get('user-b')).toBe(true);
    // E o novo host sobe pro topo.
    expect(service.participants()[0].userId).toBe('user-b');
  });

  it('sem sala carregada ninguém é host', () => {
    currentRoom.set(null);
    setRows([row('user-host', '2026-06-12T00:01:00Z')]);

    expect(service.participants()[0].isHost).toBe(false);
  });
});
