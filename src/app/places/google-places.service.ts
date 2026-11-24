import { DOCUMENT } from '@angular/common';
import { Injectable, LOCALE_ID, inject } from '@angular/core';
import { GOOGLE_MAPS_BROWSER_KEY } from '../../version.generated';

export class MapsLoadError extends Error {
  constructor(readonly code: 'MAPS_SCRIPT' | 'MAPS_TIMEOUT' | 'PLACES_LIBRARY') {
    super(code);
  }
}

export interface Coordinates {
  readonly latitude: number;
  readonly longitude: number;
}

export interface GooglePlaceSelection {
  readonly id: string;
  readonly label: string;
}

export interface PlaceAutocompleteElement extends HTMLElement {
  locationBias?: { center: { lat: number; lng: number }; radius: number };
}

interface PlacesLibrary {
  readonly PlaceAutocompleteElement: new (options: {
    placeholder: string;
  }) => PlaceAutocompleteElement;
}

type MapsWindow = Window & {
  google?: { maps?: { importLibrary(name: 'places'): Promise<PlacesLibrary> } };
  karaokeMapsLoaded?: () => void;
};

@Injectable({ providedIn: 'root' })
export class GooglePlacesService {
  private readonly document = inject(DOCUMENT);
  private readonly locale = inject(LOCALE_ID);
  private library?: Promise<PlacesLibrary>;

  readonly configured = Boolean(GOOGLE_MAPS_BROWSER_KEY);

  load(): Promise<PlacesLibrary> {
    this.library ??= this.loadMaps().catch((error: unknown) => {
      this.library = undefined;
      throw error;
    });
    return this.library;
  }

  private async loadMaps(): Promise<PlacesLibrary> {
    const window = this.document.defaultView as MapsWindow | null;
    if (!window || !this.configured) throw new MapsLoadError('MAPS_SCRIPT');

    if (!window.google?.maps?.importLibrary) {
      await new Promise<void>((resolve, reject) => {
        const script = this.document.createElement('script');
        const url = new URL('https://maps.googleapis.com/maps/api/js');
        url.search = new URLSearchParams({
          key: GOOGLE_MAPS_BROWSER_KEY,
          callback: 'karaokeMapsLoaded',
          loading: 'async',
          language: this.locale,
          v: 'weekly',
        }).toString();

        const timeout = window.setTimeout(() => fail('MAPS_TIMEOUT'), 12000);
        const fail = (code: 'MAPS_SCRIPT' | 'MAPS_TIMEOUT') => {
          window.clearTimeout(timeout);
          script.remove();
          delete window.karaokeMapsLoaded;
          reject(new MapsLoadError(code));
        };

        window.karaokeMapsLoaded = () => {
          window.clearTimeout(timeout);
          delete window.karaokeMapsLoaded;
          resolve();
        };
        script.src = url.href;
        script.async = true;
        script.onerror = () => fail('MAPS_SCRIPT');
        this.document.head.append(script);
      });
    }

    try {
      const maps = window.google?.maps;
      if (!maps) throw new Error();
      return await maps.importLibrary('places');
    } catch {
      throw new MapsLoadError('PLACES_LIBRARY');
    }
  }
}
