import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { RoomVenueComponent } from './room-venue.component';

describe('RoomVenueComponent', () => {
  it('includes the typed address and pin in the Maps link and supports rooms with just an address', () => {
    const fixture = TestBed.createComponent(RoomVenueComponent);
    const view: HTMLElement = fixture.nativeElement;
    const room = { venue_name: 'Rua Antônio, 10 / A+B & anexo', google_place_id: null, latitude: 0, longitude: -35 };
    fixture.componentRef.setInput('room', room);
    fixture.detectChanges();
    const url = () => new URL(view.querySelector('a')!.href);
    const segments = url().pathname.split('/');
    expect(segments.slice(0, 3)).toEqual(['', 'maps', 'place']);
    expect(decodeURIComponent(segments[3].replaceAll('+', ' '))).toBe(room.venue_name);
    expect(segments[4]).toBe('@0,-35,17z');

    fixture.componentRef.setInput('room', { ...room, latitude: null, longitude: null });
    fixture.detectChanges();
    expect(url().searchParams.get('query')).toBe(room.venue_name);
  });
});
