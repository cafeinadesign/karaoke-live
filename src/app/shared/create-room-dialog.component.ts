import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';

import { NewRoom } from '../types';
import { Coordinates, VenueMapComponent } from '../places/venue-map.component';

export type CreateRoomDialogResult = NewRoom;

type GeoState = 'idle' | 'loading' | 'granted' | 'denied' | 'error';

@Component({
  selector: 'app-create-room-dialog',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    VenueMapComponent,
  ],
  template: `
    <h2 mat-dialog-title i18n="@@createRoom.title">Criar sala</h2>
    <mat-dialog-content>
      <mat-form-field appearance="outline" class="name-field">
        <mat-label i18n="@@createRoom.nameLabel">Nome da sala</mat-label>
        <input
          matInput
          type="text"
          maxlength="80"
          required
          [formControl]="nameControl"
          i18n-placeholder="@@createRoom.namePlaceholder"
          placeholder="Aniversário da Lu, terça no bar…"
        />
        <mat-hint align="end">{{ nameValue().length }} / 80</mat-hint>
      </mat-form-field>

      <section class="venue" aria-labelledby="venue-label">
        <span id="venue-label" class="geo-label" i18n="@@venue.label">Local da sala</span>
        <mat-form-field appearance="outline" class="name-field">
          <mat-label i18n="@@venue.manual">Nome ou endereço do local</mat-label>
          <input matInput type="text" required maxlength="160" [formControl]="venueControl" />
        </mat-form-field>
        <app-venue-map [point]="geo()" (picked)="markVenue($event)" />
        <div role="status" class="hint">
          @if (lookingUpAddress()) {
            <span i18n="@@venue.findingAddress">Buscando endereço do pin…</span>
          } @else if (geoState() === 'loading') {
            <span i18n="@@createRoom.geoLoading">Obtendo sua localização…</span>
          } @else if (geoState() === 'error' || geoState() === 'denied') {
            {{ geoError() }}
          }
        </div>
        @if (geoState() === 'denied') {
          <button matButton type="button" (click)="requestGeo()" i18n="@@venue.enableLocation">Habilitar localização</button>
        } @else if (geoState() === 'error') {
          <button matButton type="button" (click)="requestGeo()" i18n="@@createRoom.geoRetry">Tentar de novo</button>
        }
      </section>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button matButton type="button" [mat-dialog-close]="null" i18n="@@common.cancel">
        Cancelar
      </button>
      <button matButton="filled" type="button" [disabled]="!canSubmit()" (click)="submit()">
        <mat-icon>add_circle</mat-icon>
        <span i18n="@@createRoom.submit">Criar sala</span>
      </button>
    </mat-dialog-actions>
  `,
  styles: `
.name-field
  width: 100%

.venue
  display: flex
  flex-direction: column
  gap: 8px
  margin-top: 4px

.venue
  align-items: stretch
  margin-bottom: 12px

  > button
    align-self: flex-start

.geo-label
  font-size: 12px
  color: var(--mat-sys-on-surface-variant)
  text-transform: uppercase
  letter-spacing: 0.4px

.geo-row
  display: flex
  align-items: center
  gap: 10px
  font-size: 14px

.hint
  margin: 0
  font-size: 12px
  color: var(--mat-sys-on-surface-variant)

  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CreateRoomDialogComponent {
  private readonly ref = inject(MatDialogRef) as MatDialogRef<
    CreateRoomDialogComponent,
    CreateRoomDialogResult | null
  >;

  private readonly destroyRef = inject(DestroyRef);
  protected readonly venueControl = new FormControl('', {
    nonNullable: true,
    validators: [Validators.maxLength(160)],
  });
  protected readonly venueValue = toSignal(this.venueControl.valueChanges, {
    initialValue: this.venueControl.value,
  });

  protected readonly nameControl = new FormControl<string>('', {
    nonNullable: true,
    validators: [Validators.required, Validators.maxLength(80)],
  });

  protected readonly nameValue = toSignal(this.nameControl.valueChanges, {
    initialValue: this.nameControl.value,
  });

  protected readonly geoState = signal<GeoState>('idle');
  protected readonly geo = signal<Coordinates | null>(null);
  protected readonly lookingUpAddress = signal(false);
  protected readonly geoError = signal<string>('');

  protected readonly canSubmit = computed(
    () =>
      this.nameValue().trim().length > 0 &&
      this.nameControl.valid &&
      this.venueValue().trim().length > 0 && this.venueControl.valid,
  );

  constructor() {
    this.requestGeo();
  }

  protected requestGeo(): void {
    this.geo.set(null);
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      this.geoState.set('error');
      this.geoError.set(
        $localize`:@@createRoom.geoUnsupported:Geolocalização não está disponível neste dispositivo.`,
      );
      return;
    }
    this.geoState.set('loading');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (this.destroyRef.destroyed || this.geo()) return;
        const coordinates = {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        };
        this.markVenue(coordinates);
      },
      (err) => {
        if (this.destroyRef.destroyed || this.geo()) return;
        this.geoState.set(err.code === err.PERMISSION_DENIED ? 'denied' : 'error');
        this.geoError.set(this.mapGeoError(err));
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 },
    );
  }

  protected submit(): void {
    if (!this.canSubmit()) return;
    const geo = this.geo();
    this.ref.close({
      name: this.nameControl.value.trim(),
      latitude: geo?.latitude ?? null,
      longitude: geo?.longitude ?? null,
      venue_name: this.venueControl.value.trim(),
      google_place_id: null,
    });
  }

  protected markVenue(point: Coordinates): void {
    this.geo.set(point);
    this.geoState.set('granted');
    this.lookingUpAddress.set(false);
    if (this.venueControl.pristine) {
      this.venueControl.setValue('');
      void this.suggestAddress(point);
    }
  }

  private async suggestAddress(point: Coordinates): Promise<void> {
    this.lookingUpAddress.set(true);
    try {
      const response = await fetch('/api/reverse-geocode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(point),
        signal: AbortSignal.timeout(7000),
      });
      if (!response.ok) return;
      const result: { address?: unknown } = await response.json();
      if (this.destroyRef.destroyed || this.geo() !== point || this.venueControl.dirty) return;
      if (typeof result.address === 'string' && result.address.trim().length <= 160) {
        this.venueControl.setValue(result.address.trim());
      }
    } catch {
      // The host can still enter the address manually.
    } finally {
      if (!this.destroyRef.destroyed && this.geo() === point) this.lookingUpAddress.set(false);
    }
  }

  private mapGeoError(err: GeolocationPositionError): string {
    switch (err.code) {
      case err.PERMISSION_DENIED:
        return $localize`:@@createRoom.geoDenied:Permissão de localização negada. Libere no navegador e tente de novo.`;
      case err.POSITION_UNAVAILABLE:
        return $localize`:@@createRoom.geoUnavailable:Não foi possível obter sua localização agora.`;
      case err.TIMEOUT:
        return $localize`:@@createRoom.geoTimeout:Tempo esgotado ao obter sua localização.`;
      default:
        return $localize`:@@createRoom.geoUnknown:Erro ao obter sua localização.`;
    }
  }
}
