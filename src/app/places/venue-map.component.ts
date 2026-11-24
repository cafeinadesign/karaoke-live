import {
  afterNextRender, ChangeDetectionStrategy, Component, DestroyRef, effect, ElementRef,
  inject, input, output, signal, viewChild,
} from '@angular/core';
import type { Map as LeafletMap, Marker } from 'leaflet';

export interface Coordinates {
  readonly latitude: number;
  readonly longitude: number;
}

@Component({
  selector: 'app-venue-map',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p id="pin-help" i18n="@@venue.pinHelp">Toque no mapa para marcar o local. Com o teclado, use as setas e pressione Enter para marcar o centro.</p>
    <div #canvas tabindex="0" role="region" aria-label="Mapa do local da sala"
      i18n-aria-label="@@venue.mapLabel" aria-describedby="pin-help" (keydown.enter)="markCenter($event)"></div>
  `,
  styles: `
div
  height: 210px
  border-radius: 8px
  isolation: isolate
  &:focus-visible
    outline: 3px solid var(--mat-sys-primary)
p
  font-size: 0.875rem
  margin: 0 0 8px
  `,
})
export class VenueMapComponent {
  readonly point = input<Coordinates | null>(null);
  readonly picked = output<Coordinates>();
  private readonly canvas = viewChild.required<ElementRef<HTMLDivElement>>('canvas');
  private readonly destroyRef = inject(DestroyRef);
  private readonly library = signal<typeof import('leaflet') | null>(null);
  private map?: LeafletMap;
  private marker?: Marker;

  constructor() {
    afterNextRender(async () => {
      const L = await import('leaflet');
      if (this.destroyRef.destroyed) return;
      const element = this.canvas().nativeElement;
      const map = L.map(element, { scrollWheelZoom: false }).setView([-14, -52], 3);
      this.map = map;
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(map);
      map.on('click', ({ latlng }) => this.pick(latlng));
      const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => map.invalidateSize());
      observer?.observe(element);
      this.destroyRef.onDestroy(() => { observer?.disconnect(); map.remove(); });
      this.library.set(L);
    });

    effect(() => {
      const L = this.library();
      const point = this.point();
      if (!L || !this.map || !point) return;
      const position = L.latLng(point.latitude, point.longitude);
      if (this.marker) {
        this.marker.setLatLng(position);
      } else {
        const icon = L.divIcon({ className: 'venue-pin', iconSize: [20, 20], iconAnchor: [10, 20] });
        this.marker = L.marker(position, { icon, interactive: false, keyboard: false }).addTo(this.map);
      }
      this.map.setView(position, Math.max(this.map.getZoom(), 16));
    });
  }

  protected markCenter(event: Event): void {
    if (this.map && event.target === this.canvas().nativeElement) {
      event.preventDefault();
      this.pick(this.map.getCenter());
    }
  }

  private pick(position: import('leaflet').LatLng): void {
    const point = position.wrap();
    this.picked.emit({ latitude: point.lat, longitude: point.lng });
  }
}
