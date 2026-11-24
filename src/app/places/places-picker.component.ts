import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import {
  Coordinates,
  GooglePlaceSelection,
  GooglePlacesService,
  PlaceAutocompleteElement,
} from './google-places.service';

interface PlacePredictionSelectEvent extends Event {
  readonly placePrediction: { readonly placeId: string; readonly text: { toString(): string } };
}

@Component({
  selector: 'app-places-picker',
  template: `
    @if (failed()) {
      <p role="status" i18n="@@venue.searchFailed">Busca indisponível. Preencha o local manualmente.</p>
    } @else if (!widget()) {
      <p role="status" i18n="@@venue.searchLoading">Carregando busca de locais…</p>
    }
    <div #mount [hidden]="failed()"></div>
  `,
  styles: `
:host
  display: block

p
  margin: 0 0 8px
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlacesPickerComponent {
  private readonly places = inject(GooglePlacesService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly mount = viewChild.required<ElementRef<HTMLElement>>('mount');
  protected readonly widget = signal<PlaceAutocompleteElement | null>(null);
  protected readonly failed = signal(false);

  readonly coordinates = input<Coordinates | null>(null);
  readonly selected = output<GooglePlaceSelection>();

  constructor() {
    effect(() => {
      const coordinates = this.coordinates();
      const widget = this.widget();
      if (widget) {
        widget.locationBias = coordinates ? {
          center: { lat: coordinates.latitude, lng: coordinates.longitude },
          radius: 5000,
        } : null;
      }
    });

    void this.places.load().then(({ PlaceAutocompleteElement }) => {
      if (this.destroyRef.destroyed) return;
      const widget = new PlaceAutocompleteElement({
        placeholder: $localize`:@@venue.searchPlaceholder:Busque um local ou endereço`,
      });
      widget.style.width = '100%';
      widget.setAttribute('aria-label', $localize`:@@venue.searchPlaceholder:Busque um local ou endereço`);
      const listeners = new AbortController();
      widget.addEventListener('gmp-select', (event) => {
        const { placePrediction } = event as PlacePredictionSelectEvent;
        this.selected.emit({ id: placePrediction.placeId, label: placePrediction.text.toString() });
      }, { signal: listeners.signal });
      widget.addEventListener('gmp-error', () => {
        this.failed.set(true);
      }, { signal: listeners.signal });
      this.destroyRef.onDestroy(() => listeners.abort());
      this.mount().nativeElement.append(widget);
      this.widget.set(widget);
    }).catch(() => {
      if (!this.destroyRef.destroyed) this.failed.set(true);
    });
  }
}
