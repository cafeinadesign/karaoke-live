import { computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';
import { AuthService } from '../../auth/auth.service';
import { RoomMembership, RoomsService } from '../../rooms/rooms.service';
import { LandingComponent } from './landing.component';

describe('LandingComponent room history', () => {
  it('recovers the account’s rooms after the session is restored', async () => {
    const user = signal<{ id: string } | null>(null);
    const memberships: RoomMembership[] = [
      {
        left_at: null,
        rooms: {
          id: 'current', code: 'NOW123', name: 'Sala atual', host_id: 'other', ended_at: null,
        },
      },
      {
        left_at: '2026-11-23T12:00:00Z',
        rooms: {
          id: 'past', code: 'OLD123', name: 'Sala anterior', host_id: 'other',
          ended_at: '2026-11-23T13:00:00Z',
        },
      },
      {
        left_at: null,
        rooms: {
          id: 'hosted', code: 'OWN123', name: 'Minha festa', host_id: 'guest', ended_at: null,
        },
      },
    ];
    const listMemberships = vi.fn().mockResolvedValue(memberships);

    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: { user, isAuthenticated: computed(() => !!user()) } },
        { provide: RoomsService, useValue: { listMemberships } },
      ],
    });

    const fixture = TestBed.createComponent(LandingComponent);
    const view: HTMLElement = fixture.nativeElement;
    fixture.detectChanges();
    expect(listMemberships).not.toHaveBeenCalled();

    user.set({ id: 'guest' });
    fixture.detectChanges();
    await listMemberships.mock.results[0]?.value;
    fixture.detectChanges();

    expect(listMemberships).toHaveBeenCalledWith('guest');
    expect(view.querySelector('.my-rooms')?.textContent).toContain('Sala anterior');
    expect(view.querySelector('.my-rooms')?.textContent).toContain('Encerrada');
    expect(
      Array.from(view.querySelectorAll('.my-rooms a'), (link) => link.getAttribute('href')),
    ).toEqual(['/mobile/NOW123', '/host-dashboard/hosted']);
  });
});
