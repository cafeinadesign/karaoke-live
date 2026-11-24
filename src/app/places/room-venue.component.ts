import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { Room } from '../types';

@Component({
  selector: 'app-room-venue',
  imports: [MatButtonModule, MatIconModule],
  template: `
    @if (mapsUrl(); as url) {
      <a matButton="tonal" [href]="url" target="_blank" rel="noopener noreferrer">
        <mat-icon>place</mat-icon>
        <span i18n="@@venue.openMaps">Ver local no Google Maps</span>
      </a>
    } @else if (room().venue_name; as name) {
      <p>
        <mat-icon aria-hidden="true">place</mat-icon>
        <span>{{ name }}</span>
      </p>
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
  readonly room = input.required<Pick<Room, 'google_place_id' | 'venue_name'>>();

  protected readonly mapsUrl = computed(() => {
    const id = this.room().google_place_id;
    if (!id) return null;

    const url = new URL('https://www.google.com/maps/search/');
    url.search = new URLSearchParams({
      api: '1',
      query: this.room().venue_name ?? $localize`:@@venue.label:Local da sala`,
      query_place_id: id,
    }).toString();
    return url.href;
  });
}
