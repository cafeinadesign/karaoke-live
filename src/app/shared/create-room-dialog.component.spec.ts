import { TestBed } from '@angular/core/testing';
import { MatDialogRef } from '@angular/material/dialog';
import { describe, expect, it, vi } from 'vitest';
import { CreateRoomDialogComponent } from './create-room-dialog.component';

describe('CreateRoomDialogComponent', () => {
  it('requires a venue and saves manual entry when device coordinates are unavailable', () => {
    const close = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        { provide: MatDialogRef, useValue: { close } },
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

  it('requests location on opening and saves the GPS pin with the typed address', async () => {
    const close = vi.fn();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ address: 'Rua do Sol, 8' })));
    const getCurrentPosition = vi.fn((success: PositionCallback) => {
      success({ coords: { latitude: -8, longitude: -35 } } as GeolocationPosition);
    });
    vi.stubGlobal('navigator', { platform: navigator.platform, userAgent: navigator.userAgent, geolocation: { getCurrentPosition } });
    try {
      TestBed.configureTestingModule({
        providers: [
          { provide: MatDialogRef, useValue: { close } },
        ],
      });
      const fixture = TestBed.createComponent(CreateRoomDialogComponent);
      fixture.detectChanges();
      const view: HTMLElement = fixture.nativeElement;
      expect(getCurrentPosition).toHaveBeenCalledTimes(1);
      const name = view.querySelector<HTMLInputElement>('input')!;
      name.value = 'Sexta';
      name.dispatchEvent(new Event('input'));
      await fixture.whenStable();
      const address = view.querySelector<HTMLInputElement>('.venue input')!;
      await vi.waitFor(() => expect(address.value).toBe('Rua do Sol, 8'));
      address.value = 'Rua do Sol, 10';
      address.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      view.querySelector<HTMLButtonElement>('mat-dialog-actions button:last-child')!.click();
      expect(close).toHaveBeenCalledWith({
        name: 'Sexta', latitude: -8, longitude: -35, venue_name: 'Rua do Sol, 10', google_place_id: null,
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('offers to enable location after denial and keeps a typed address on retry', async () => {
    const getCurrentPosition = vi.fn()
      .mockImplementationOnce((_success, deny) => deny({ code: 1, PERMISSION_DENIED: 1 }))
      .mockImplementationOnce((success) => success({ coords: { latitude: -8, longitude: -35 } }));
    vi.stubGlobal('navigator', { platform: navigator.platform, userAgent: navigator.userAgent, geolocation: { getCurrentPosition } });
    try {
      TestBed.configureTestingModule({
        providers: [
          { provide: MatDialogRef, useValue: { close: vi.fn() } },
        ],
      });
      const fixture = TestBed.createComponent(CreateRoomDialogComponent);
      fixture.detectChanges();
      const view: HTMLElement = fixture.nativeElement;
      const field = view.querySelector<HTMLInputElement>('.venue input')!;
      field.value = 'Rua B';
      field.dispatchEvent(new Event('input'));
      const retry = view.querySelector<HTMLButtonElement>('.venue button')!;
      expect(retry.textContent).toContain('Habilitar localização');
      retry.click();
      await fixture.whenStable();
      expect(field.value).toBe('Rua B');
      expect(view.querySelector('.venue button')).toBeNull();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('creates a scheduled public event with start/end timestamps, timezone, and started_at null', () => {
    const close = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        { provide: MatDialogRef, useValue: { close } },
      ],
    });

    const fixture = TestBed.createComponent(CreateRoomDialogComponent);
    fixture.detectChanges();
    const view: HTMLElement = fixture.nativeElement;

    const eventToggle = view.querySelectorAll<HTMLButtonElement>('mat-button-toggle button')[1];
    eventToggle.click();
    fixture.detectChanges();

    const nameInput = view.querySelector<HTMLInputElement>('input[type="text"]')!;
    nameInput.value = 'Karaokê do Sábado';
    nameInput.dispatchEvent(new Event('input'));

    const dateInput = view.querySelector<HTMLInputElement>('input[type="date"]')!;
    dateInput.value = '2026-12-12';
    dateInput.dispatchEvent(new Event('input'));

    const timeInput = view.querySelector<HTMLInputElement>('input[type="time"]')!;
    timeInput.value = '21:00';
    timeInput.dispatchEvent(new Event('input'));

    const venueInput = view.querySelector<HTMLInputElement>('.venue input')!;
    venueInput.value = 'Pub Central';
    venueInput.dispatchEvent(new Event('input'));

    const publicRadio = view.querySelectorAll<HTMLInputElement>('.visibility input[type="radio"]')[1];
    publicRadio.click();
    fixture.detectChanges();

    const save = view.querySelector<HTMLButtonElement>('mat-dialog-actions button:last-child')!;
    expect(save.disabled).toBe(false);
    save.click();

    expect(close).toHaveBeenCalledTimes(1);
    const payload = close.mock.calls[0][0];
    expect(payload.name).toBe('Karaokê do Sábado');
    expect(payload.venue_name).toBe('Pub Central');
    expect(payload.is_public).toBe(true);
    expect(payload.started_at).toBeNull();
    expect(payload.event_timezone).toBeTruthy();
    expect(typeof payload.scheduled_at).toBe('string');
    expect(new Date(payload.scheduled_end_at).getTime() - new Date(payload.scheduled_at).getTime())
      .toBe(3 * 3_600_000);
  });

  it('rejects past date/time when creating an event and shows an error after interaction', () => {
    const close = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        { provide: MatDialogRef, useValue: { close } },
      ],
    });

    const fixture = TestBed.createComponent(CreateRoomDialogComponent);
    fixture.detectChanges();
    const view: HTMLElement = fixture.nativeElement;

    const eventToggle = view.querySelectorAll<HTMLButtonElement>('mat-button-toggle button')[1];
    eventToggle.click();
    fixture.detectChanges();

    const nameInput = view.querySelector<HTMLInputElement>('input[type="text"]')!;
    nameInput.value = 'Evento passado';
    nameInput.dispatchEvent(new Event('input'));

    const venueInput = view.querySelector<HTMLInputElement>('.venue input')!;
    venueInput.value = 'Casa';
    venueInput.dispatchEvent(new Event('input'));

    const dateInput = view.querySelector<HTMLInputElement>('input[type="date"]')!;
    dateInput.value = '2020-01-01';
    dateInput.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    const save = view.querySelector<HTMLButtonElement>('mat-dialog-actions button:last-child')!;
    expect(save.disabled).toBe(true);
    expect(view.querySelector('.schedule-error')?.textContent).toContain('futuro');
    expect(close).not.toHaveBeenCalled();
  });

});
