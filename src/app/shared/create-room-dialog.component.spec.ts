import { TestBed } from '@angular/core/testing';
import { MatDialogRef } from '@angular/material/dialog';
import { describe, expect, it, vi } from 'vitest';
import { GooglePlacesService, PlaceAutocompleteElement } from '../places/google-places.service';
import { CreateRoomDialogComponent } from './create-room-dialog.component';

describe('CreateRoomDialogComponent', () => {
  it('requires a venue and saves manual entry without asking for device coordinates', () => {
    const close = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        { provide: MatDialogRef, useValue: { close } },
        { provide: GooglePlacesService, useValue: { configured: false } },
      ],
    });

    const fixture = TestBed.createComponent(CreateRoomDialogComponent);
    fixture.detectChanges();
    const view: HTMLElement = fixture.nativeElement;

    function enter(field: HTMLInputElement, value: string): void {
      field.value = value;
      field.dispatchEvent(new Event('input'));
      fixture.detectChanges();
    }

    const [name, venue] = [...view.querySelectorAll('input')];
    const save = view.querySelector<HTMLButtonElement>('mat-dialog-actions button:last-child')!;
    enter(name, 'Karaokê da sexta');
    expect(save.disabled).toBe(true);
    enter(venue, '   ');
    expect(save.disabled).toBe(true);
    enter(venue, 'Bar do Recife ');
    expect(save.disabled).toBe(false);
    save.click();

    expect(close).toHaveBeenCalledWith({
      name: 'Karaokê da sexta',
      latitude: null,
      longitude: null,
      venue_name: 'Bar do Recife',
      google_place_id: null,
    });
  });

  it('saves the Google place ID and keeps the suggestion text out of storage', async () => {
    class FakeAutocomplete extends HTMLElement implements PlaceAutocompleteElement {
      locationBias?: PlaceAutocompleteElement['locationBias'];
    }

    customElements.define('karaoke-test-autocomplete', FakeAutocomplete);
    const close = vi.fn();
    const library = Promise.resolve({ PlaceAutocompleteElement: FakeAutocomplete });
    TestBed.configureTestingModule({
      providers: [
        { provide: MatDialogRef, useValue: { close } },
        { provide: GooglePlacesService, useValue: { configured: true, load: () => library } },
      ],
    });

    const fixture = TestBed.createComponent(CreateRoomDialogComponent);
    fixture.detectChanges();
    const view: HTMLElement = fixture.nativeElement;
    const name = view.querySelector<HTMLInputElement>('input')!;
    name.value = 'Karaokê da sexta';
    name.dispatchEvent(new Event('input'));
    view.querySelector<HTMLButtonElement>('.venue button')!.click();
    fixture.detectChanges();
    await library;

    const widget = view.querySelector('karaoke-test-autocomplete')!;
    const selection = Object.assign(new Event('gmp-select'), {
      placePrediction: { placeId: 'place-id-example', text: 'Bar do Recife, Recife' },
    });
    widget.dispatchEvent(selection);
    fixture.detectChanges();

    expect(view.querySelector('.venue')?.textContent).toContain('Bar do Recife, Recife');
    view.querySelector<HTMLButtonElement>('mat-dialog-actions button:last-child')!.click();
    expect(close).toHaveBeenCalledWith({
      name: 'Karaokê da sexta',
      latitude: null,
      longitude: null,
      venue_name: null,
      google_place_id: 'place-id-example',
    });
  });

});
