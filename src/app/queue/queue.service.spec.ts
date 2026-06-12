import { TestBed } from '@angular/core/testing';
import { describe, beforeEach, expect, it } from 'vitest';
import { QueueService } from './queue.service';
import { SupabaseService } from '../supabase.service';
import { QueueItem } from '../types';

function item(partial: Partial<QueueItem> & Pick<QueueItem, 'id' | 'position' | 'status'>): QueueItem {
  return {
    room_id: 'room-1',
    user_id: 'user-1',
    video_id: `vid-${partial.id}`,
    video_title: `Song ${partial.id}`,
    video_thumbnail: null,
    video_duration_seconds: 180,
    gemini_message: null,
    created_at: '2026-06-12T00:00:00Z',
    started_at: null,
    finished_at: null,
    ...partial,
  };
}

describe('QueueService (reorder otimista)', () => {
  let service: QueueService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        QueueService,
        // applyPendingReorder/restoreSnapshot/displayNameFor não tocam o client.
        { provide: SupabaseService, useValue: { client: {} } },
      ],
    });
    service = TestBed.inject(QueueService);
  });

  it('reatribui as positions existentes na nova ordem dos IDs', () => {
    service.items.set([
      item({ id: 'b', position: 1, status: 'now_playing' }),
      item({ id: 'c', position: 2, status: 'pending' }),
      item({ id: 'a', position: 3, status: 'pending' }),
    ]);

    service.applyPendingReorder(['a', 'c']);

    const byId = new Map(service.items().map((i) => [i.id, i.position]));
    expect(byId.get('a')).toBe(2);
    expect(byId.get('c')).toBe(3);
    // O item now_playing não é tocado.
    expect(byId.get('b')).toBe(1);
  });

  it('mantém a lista ordenada por position após o reorder', () => {
    service.items.set([
      item({ id: 'c', position: 2, status: 'pending' }),
      item({ id: 'a', position: 3, status: 'pending' }),
    ]);

    service.applyPendingReorder(['a', 'c']);

    expect(service.items().map((i) => i.id)).toEqual(['a', 'c']);
  });

  it('restoreSnapshot reverte o estado otimista', () => {
    const original = [
      item({ id: 'c', position: 2, status: 'pending' }),
      item({ id: 'a', position: 3, status: 'pending' }),
    ];
    service.items.set(original);

    const snapshot = service.applyPendingReorder(['a', 'c']);
    expect(service.items().map((i) => i.id)).toEqual(['a', 'c']);

    service.restoreSnapshot(snapshot);
    expect(service.items().map((i) => i.id)).toEqual(['c', 'a']);
    expect(service.items().find((i) => i.id === 'c')?.position).toBe(2);
  });

  it('displayNameFor cai num placeholder quando o nome não está no cache', () => {
    expect(service.displayNameFor('desconhecido')).toBe('…');
  });
});
