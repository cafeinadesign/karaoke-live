import { computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';
import { AuthService } from '../../auth/auth.service';
import { RoomMembership, RoomSummary, RoomsService } from '../../rooms/rooms.service';
import { LandingComponent } from './landing.component';

function makeSummary(partial: Partial<RoomSummary> & Pick<RoomSummary, 'id' | 'code' | 'name' | 'host_id'>): RoomSummary {
  return {
    ended_at: null,
    scheduled_at: null,
    scheduled_end_at: null,
    event_timezone: null,
    started_at: '2026-11-23T12:00:00Z',
    is_public: false,
    venue_name: null,
    latitude: null,
    longitude: null,
    ...partial,
  };
}

describe('LandingComponent room history and public events', () => {
  it('recovers the account’s rooms after the session is restored', async () => {
    const user = signal<{ id: string } | null>(null);
    const memberships: RoomMembership[] = [
      {
        left_at: null,
        rooms: makeSummary({
          id: 'current', code: 'NOW123', name: 'Sala atual', host_id: 'other',
        }),
      },
      {
        left_at: '2026-11-23T12:00:00Z',
        rooms: makeSummary({
          id: 'past', code: 'OLD123', name: 'Sala anterior', host_id: 'other',
          ended_at: '2026-11-23T13:00:00Z',
        }),
      },
      {
        left_at: null,
        rooms: makeSummary({
          id: 'hosted', code: 'OWN123', name: 'Minha festa', host_id: 'guest',
        }),
      },
      {
        left_at: null,
        rooms: makeSummary({
          id: 'future', code: 'EVT123', name: 'Festa futura', host_id: 'guest',
          started_at: null, scheduled_at: '2026-12-10T23:00:00Z', event_timezone: 'America/Sao_Paulo',
        }),
      },
    ];
    const listMemberships = vi.fn().mockResolvedValue(memberships);
    const listPublicRooms = vi.fn().mockResolvedValue([]);

    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: { user, isAuthenticated: computed(() => !!user()) } },
        { provide: RoomsService, useValue: { listMemberships, listPublicRooms } },
      ],
    });

    const fixture = TestBed.createComponent(LandingComponent);
    const view: HTMLElement = fixture.nativeElement;
    fixture.detectChanges();
    expect(listMemberships).not.toHaveBeenCalled();

    user.set({ id: 'guest' });
    fixture.detectChanges();
    await listMemberships.mock.results[0]?.value;
    await listPublicRooms.mock.results[0]?.value;
    fixture.detectChanges();

    expect(listMemberships).toHaveBeenCalledWith('guest');
    expect(view.querySelector('.my-rooms')?.textContent).toContain('Sala anterior');
    expect(view.querySelector('.my-rooms')?.textContent).toContain('Encerrada');
    expect(view.querySelector('.my-rooms')?.textContent).toContain('Agendado para');
    expect(
      Array.from(view.querySelectorAll('.my-rooms a'), (link) => link.getAttribute('href')),
    ).toEqual(['/mobile/NOW123', '/host-dashboard/hosted', '/host-dashboard/future']);
  });

  it('lists public upcoming events, filters by search, and sorts by proximity', async () => {
    const user = signal<{ id: string } | null>({ id: 'guest' });
    const publicRooms: RoomSummary[] = [
      makeSummary({
        id: 'far',
        code: 'FAR111',
        name: 'Karaokê Longe',
        host_id: 'host-a',
        is_public: true,
        started_at: null,
        scheduled_at: '2026-12-15T23:00:00Z',
        venue_name: 'Bar Distante',
        latitude: -8.1,
        longitude: -34.9,
      }),
      makeSummary({
        id: 'near',
        code: 'NEA222',
        name: 'Karaokê Perto',
        host_id: 'host-b',
        is_public: true,
        started_at: null,
        scheduled_at: '2026-12-16T23:00:00Z',
        venue_name: 'Bar da Esquina',
        latitude: -8.048,
        longitude: -34.877,
      }),
    ];

    const getCurrentPosition = vi.fn((success: PositionCallback) => {
      success({ coords: { latitude: -8.0476, longitude: -34.877 } } as GeolocationPosition);
    });
    vi.stubGlobal('navigator', {
      platform: navigator.platform,
      userAgent: navigator.userAgent,
      geolocation: { getCurrentPosition },
    });

    try {
      const listMemberships = vi.fn().mockResolvedValue([]);
      const listPublicRooms = vi.fn().mockResolvedValue(publicRooms);

      TestBed.configureTestingModule({
        providers: [
          provideRouter([]),
          { provide: AuthService, useValue: { user, isAuthenticated: computed(() => !!user()) } },
          { provide: RoomsService, useValue: { listMemberships, listPublicRooms } },
        ],
      });

      const fixture = TestBed.createComponent(LandingComponent);
      const view: HTMLElement = fixture.nativeElement;
      fixture.detectChanges();
      await listMemberships.mock.results[0]?.value;
      await listPublicRooms.mock.results[0]?.value;
      fixture.detectChanges();

      const itemsBefore = [...view.querySelectorAll('.public-events li strong')].map((el) => el.textContent?.trim());
      expect(itemsBefore).toEqual(['Karaokê Longe', 'Karaokê Perto']);

      const nearMeBtn = view.querySelector<HTMLButtonElement>('.public-events .section-head button')!;
      nearMeBtn.click();
      fixture.detectChanges();

      const itemsSorted = [...view.querySelectorAll('.public-events li strong')].map((el) => el.textContent?.trim());
      expect(itemsSorted).toEqual(['Karaokê Perto', 'Karaokê Longe']);

      const searchInput = view.querySelector<HTMLInputElement>('.public-events input[type="search"]')!;
      searchInput.value = 'Esquina';
      searchInput.dispatchEvent(new Event('input'));
      fixture.detectChanges();

      const filtered = [...view.querySelectorAll('.public-events li strong')].map((el) => el.textContent?.trim());
      expect(filtered).toEqual(['Karaokê Perto']);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
