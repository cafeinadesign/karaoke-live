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
import { HostDashboardComponent } from './host-dashboard.component';

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
    venue_name: 'Bar do Centro',
    google_place_id: null,
    ...partial,
  };
}

describe('HostDashboardComponent scheduled events', () => {
  it('shows the pre-event banner, disables advance, and calls startRoom on click', async () => {
    const scheduledRoom = makeRoom();
    const currentRoom = signal<Room | null>(scheduledRoom);
    const startRoom = vi.fn(async () => {
      const started = makeRoom({ started_at: '2026-12-10T22:55:00Z' });
      currentRoom.set(started);
      return started;
    });

    const roomsMock = {
      currentRoom,
      loadRoomById: vi.fn().mockResolvedValue(scheduledRoom),
      watchRoom: vi.fn().mockResolvedValue(undefined),
      unwatchRoom: vi.fn().mockResolvedValue(undefined),
      startRoom,
      endRoom: vi.fn().mockResolvedValue(undefined),
      transferHost: vi.fn().mockResolvedValue(undefined),
    };
    const queueMock = {
      items: signal<ReadonlyArray<QueueItem>>([]),
      subscribe: vi.fn().mockResolvedValue(undefined),
      unsubscribe: vi.fn().mockResolvedValue(undefined),
      advanceNext: vi.fn(),
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
          useValue: { snapshot: { paramMap: convertToParamMap({ roomId: 'room-1' }) } },
        },
        {
          provide: AuthService,
          useValue: {
            user: signal({ id: 'host-1' }),
            profile: signal({ id: 'host-1', display_name: 'Host', avatar_url: null, created_at: '' }),
          },
        },
        { provide: YoutubeService, useValue: { search: vi.fn(), generateRoast: vi.fn() } },
        { provide: ConfirmService, useValue: { ask: vi.fn().mockResolvedValue(false) } },
      ],
    });
    TestBed.overrideComponent(HostDashboardComponent, {
      set: {
        providers: [
          { provide: RoomsService, useValue: roomsMock },
          { provide: QueueService, useValue: queueMock },
          { provide: ParticipantsService, useValue: participantsMock },
        ],
      },
    });

    const fixture = TestBed.createComponent(HostDashboardComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const view: HTMLElement = fixture.nativeElement;
    expect(view.querySelector('.scheduled-card')).not.toBeNull();
    expect(view.querySelector('.scheduled-card')?.textContent).toContain('Agendado');
    expect(view.querySelector('a[href*="calendar.google.com"]')).not.toBeNull();

    const nextBtn = view.querySelector<HTMLButtonElement>('.next-btn')!;
    expect(nextBtn.disabled).toBe(true);

    const startBtn = view.querySelector<HTMLButtonElement>('.start-event-btn')!;
    startBtn.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(startRoom).toHaveBeenCalledWith('room-1');
    expect(view.querySelector('.scheduled-card')).toBeNull();
    expect(view.querySelector('.player-empty')).not.toBeNull();
  });
});
