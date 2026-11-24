import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { Room } from '../types';

@Component({
  selector: 'app-room-venue',
  imports: [MatButtonModule, MatIconModule],
  template: `
    @if (room().venue_name; as name) {
      <p>{{ name }}</p>
    }
    @if (mapsUrl(); as url) {
      <a matButton="tonal" [href]="url" target="_blank" rel="noopener noreferrer">
        <mat-icon>place</mat-icon>
        <span i18n="@@venue.openMaps">Ver local no Google Maps</span>
      </a>
    }
  `,
  styles: `
p
  display: flex
  align-items: center
  gap: 8px
  margin: 0
  overflow-wrap: anywhere
  color: var(--mat-sys-on-surface-variant)

mat-icon
  flex-shrink: 0
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RoomVenueComponent {
  readonly room = input.required<Pick<Room, 'google_place_id' | 'venue_name' | 'latitude' | 'longitude'>>();

  protected readonly mapsUrl = computed(() => {
    const { google_place_id: id, venue_name: name, latitude, longitude } = this.room();
    const coordinates = latitude != null && longitude != null ? `${latitude},${longitude}` : '';
    const address = name?.trim();
    if (address && coordinates && !id) {
      const place = encodeURIComponent(address).replaceAll('%20', '+');
      return `https://www.google.com/maps/place/${place}/@${coordinates},17z`;
    }

    const query = address || coordinates;
    if (!query && !id) return null;

    const url = new URL('https://www.google.com/maps/search/');
    url.search = new URLSearchParams({
      api: '1',
      query: query || $localize`:@@venue.label:Local da sala`,
      ...(id && { query_place_id: id }),
    }).toString();
    return url.href;
  });
}
