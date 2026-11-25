import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';
import { AuthService } from '../../auth/auth.service';
import { ParticipantsService } from '../../participants/participants.service';
import { QueueService } from '../../queue/queue.service';
import { RoomsService } from '../../rooms/rooms.service';
import { ConfirmService } from '../../shared/confirm.service';
import { QueueItem, Room } from '../../types';
import { YoutubeService } from '../../youtube/youtube.service';
import { MobileComponent } from './mobile.component';

function makeRoom(partial: Partial<Room> = {}): Room {
  return {
    id: 'room-1',
    code: 'EVT123',
    host_id: 'host-1',
    name: 'Noite de Karaokê',
    current_item_id: null,
    created_at: '2026-11-25T10:00:00Z',
    scheduled_at: '2026-12-10T23:00:00Z',
    scheduled_end_at: '2026-12-11T02:00:00Z',
    event_timezone: 'America/Sao_Paulo',
    started_at: null,
    ended_at: null,
    is_public: true,
    latitude: -8.0476,
    longitude: -34.877,
    venue_id: null,
    venue_name: 'Bar do Centro',
    google_place_id: null,
    ...partial,
  };
}

describe('MobileComponent scheduled events', () => {
  it('displays the pre-event banner with calendar actions and switches live when started_at updates', async () => {
    const scheduledRoom = makeRoom();
    const currentRoom = signal<Room | null>(scheduledRoom);

    const roomsMock = {
      currentRoom,
      joinByCode: vi.fn().mockResolvedValue(scheduledRoom),
      watchRoom: vi.fn().mockResolvedValue(undefined),
      unwatchRoom: vi.fn().mockResolvedValue(undefined),
      leaveMembership: vi.fn().mockResolvedValue(undefined),
    };
    const queueMock = {
      items: signal<ReadonlyArray<QueueItem>>([]),
      subscribe: vi.fn().mockResolvedValue(undefined),
      unsubscribe: vi.fn().mockResolvedValue(undefined),
      displayNameFor: vi.fn().mockReturnValue('Convidado'),
    };
    const participantsMock = {
      participants: signal([]),
      join: vi.fn().mockResolvedValue(undefined),
    };

    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap({ code: 'EVT123' }) } },
        },
        {
          provide: AuthService,
          useValue: {
            user: signal({ id: 'guest-1' }),
            profile: signal({ id: 'guest-1', display_name: 'Ana', avatar_url: null, created_at: '' }),
          },
        },
        { provide: YoutubeService, useValue: { search: vi.fn(), generateRoast: vi.fn() } },
        { provide: ConfirmService, useValue: { ask: vi.fn().mockResolvedValue(false) } },
      ],
    });
    TestBed.overrideComponent(MobileComponent, {
      set: {
        providers: [
          { provide: RoomsService, useValue: roomsMock },
          { provide: QueueService, useValue: queueMock },
          { provide: ParticipantsService, useValue: participantsMock },
        ],
      },
    });

    const fixture = TestBed.createComponent(MobileComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const view: HTMLElement = fixture.nativeElement;
    expect(view.querySelector('.event-banner')).not.toBeNull();
    expect(view.querySelector('.event-banner')?.textContent).toContain('pré-fila');
    expect(view.querySelector('a[href*="calendar.google.com"]')).not.toBeNull();
    expect(view.querySelector('app-song-search')).not.toBeNull();

    currentRoom.set(makeRoom({ started_at: '2026-12-10T23:00:00Z' }));
    fixture.detectChanges();

    expect(view.querySelector('.event-banner')).toBeNull();
  });
});
