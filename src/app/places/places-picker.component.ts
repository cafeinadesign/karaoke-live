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
import { MatButtonModule } from '@angular/material/button';
import {
  Coordinates,
  GooglePlaceSelection,
  GooglePlacesService,
  MapsLoadError,
  PlaceAutocompleteElement,
} from './google-places.service';

interface PlacePredictionSelectEvent extends Event {
  readonly placePrediction: { readonly placeId: string; readonly text: { toString(): string } };
}

@Component({
  selector: 'app-places-picker',
  imports: [MatButtonModule],
  template: `
    @if (failure(); as code) {
      <p role="status">
        <span i18n="@@venue.searchFailed">Busca indisponível. Preencha o local manualmente.</span>
        <br />
        <span i18n="@@venue.searchErrorCode">Código do erro</span> <code>{{ code }}</code>
      </p>
      <button matButton type="button" (click)="loadWidget()" i18n="@@venue.searchRetry">
        Tentar de novo
      </button>
    } @else if (!widget()) {
      <p role="status" i18n="@@venue.searchLoading">Carregando busca de locais…</p>
    }
    <div #mount [hidden]="failure() !== null"></div>
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
  protected readonly failure = signal<MapsLoadError['code'] | 'PLACES_REQUEST' | 'PLACES_WIDGET' | null>(null);
  private listeners?: AbortController;

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
        } : undefined;
      }
    });

    this.destroyRef.onDestroy(() => this.listeners?.abort());
    void this.loadWidget();
  }

  protected async loadWidget(): Promise<void> {
    this.listeners?.abort();
    this.widget()?.remove();
    this.widget.set(null);
    this.failure.set(null);

    try {
      const { PlaceAutocompleteElement } = await this.places.load();
      if (this.destroyRef.destroyed) return;
      const widget = new PlaceAutocompleteElement({
        placeholder: $localize`:@@venue.searchPlaceholder:Busque um local ou endereço`,
      });
      widget.style.width = '100%';
      widget.setAttribute('aria-label', $localize`:@@venue.searchPlaceholder:Busque um local ou endereço`);
      const listeners = new AbortController();
      this.listeners = listeners;
      widget.addEventListener('gmp-select', (event) => {
        const { placePrediction } = event as PlacePredictionSelectEvent;
        this.selected.emit({ id: placePrediction.placeId, label: placePrediction.text.toString() });
      }, { signal: listeners.signal });
      widget.addEventListener('gmp-error', () => {
        this.failure.set('PLACES_REQUEST');
      }, { signal: listeners.signal });
      this.mount().nativeElement.append(widget);
      this.widget.set(widget);
    } catch (error) {
      if (!this.destroyRef.destroyed) {
        this.failure.set(error instanceof MapsLoadError ? error.code : 'PLACES_WIDGET');
      }
    }
  }
}
