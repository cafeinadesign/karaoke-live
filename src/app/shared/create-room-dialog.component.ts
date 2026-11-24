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
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { NewRoom } from '../types';
import { Coordinates, GooglePlaceSelection, GooglePlacesService } from '../places/google-places.service';
import { PlacesPickerComponent } from '../places/places-picker.component';

export type CreateRoomDialogResult = NewRoom;

type GeoState = 'idle' | 'loading' | 'granted' | 'error';

@Component({
  selector: 'app-create-room-dialog',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    PlacesPickerComponent,
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
        @if (selectedPlace(); as place) {
          <div class="geo-row">
            <mat-icon class="ok" aria-hidden="true">place</mat-icon>
            <span>{{ place.label }}</span>
            <button matButton type="button" (click)="selectedPlace.set(null)" i18n="@@venue.change">
              Trocar local
            </button>
          </div>
        } @else {
          @if (placesConfigured) {
            @if (searching()) {
              <app-places-picker [coordinates]="geo()" (selected)="selectedPlace.set($event)" />
            } @else {
              <button matButton="tonal" type="button" (click)="searching.set(true)">
                <mat-icon>search</mat-icon>
                <span i18n="@@venue.search">Buscar no Google Maps</span>
              </button>
            }
          }
          <mat-form-field appearance="outline" class="name-field">
            <mat-label i18n="@@venue.manual">Nome ou endereço do local</mat-label>
            <input matInput type="text" maxlength="160" [formControl]="venueControl" />
          </mat-form-field>
        }
      </section>

      <div class="geo">
        <span class="geo-label" i18n="@@venue.geoLabel">Sua localização (opcional)</span>

        @switch (geoState()) {
          @case ('idle') {
            <button matButton="tonal" type="button" (click)="requestGeo()">
              <mat-icon>my_location</mat-icon>
              <span i18n="@@createRoom.geoRequest">Usar minha localização</span>
            </button>
            <p class="hint" i18n="@@venue.geoHint">
              Se você compartilhar a localização, ela prioriza resultados próximos e é salva com a sala.
            </p>
          }
          @case ('loading') {
            <div class="geo-row">
              <mat-progress-spinner mode="indeterminate" diameter="20" />
              <span i18n="@@createRoom.geoLoading">Obtendo sua localização…</span>
            </div>
          }
          @case ('granted') {
            <div class="geo-row">
              <mat-icon class="ok" aria-hidden="true">check_circle</mat-icon>
              <span i18n="@@venue.geoReady">Localização obtida</span>
              <button
                matIconButton
                type="button"
                (click)="requestGeo()"
                i18n-aria-label="@@createRoom.geoRefresh"
                aria-label="Atualizar localização"
              >
                <mat-icon>refresh</mat-icon>
              </button>
              <button matButton type="button" (click)="clearGeo()" i18n="@@venue.clearGeo">
                Remover
              </button>
            </div>
          }
          @case ('error') {
            <div class="geo-error">
              <div class="geo-row">
                <mat-icon class="err" aria-hidden="true">error</mat-icon>
                <span>{{ geoError() }}</span>
              </div>
              <button matButton="tonal" type="button" (click)="requestGeo()">
                <mat-icon>refresh</mat-icon>
                <span i18n="@@createRoom.geoRetry">Tentar de novo</span>
              </button>
            </div>
          }
        }
      </div>
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

.venue, .geo
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

.geo-error
  display: flex
  flex-direction: column
  gap: 8px

.hint
  margin: 0
  font-size: 12px
  color: var(--mat-sys-on-surface-variant)

.ok
  color: var(--mat-sys-tertiary, #43a047)

.err
  color: #d32f2f

  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CreateRoomDialogComponent {
  private readonly ref = inject(MatDialogRef) as MatDialogRef<
    CreateRoomDialogComponent,
    CreateRoomDialogResult | null
  >;

  private readonly destroyRef = inject(DestroyRef);
  protected readonly placesConfigured = inject(GooglePlacesService).configured;
  protected readonly searching = signal(false);
  protected readonly selectedPlace = signal<GooglePlaceSelection | null>(null);

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
  protected readonly geoError = signal<string>('');

  protected readonly canSubmit = computed(
    () =>
      this.nameValue().trim().length > 0 &&
      this.nameControl.valid &&
      (Boolean(this.selectedPlace()) || (this.venueControl.valid && this.venueValue().trim().length > 0)),
  );

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
        if (this.destroyRef.destroyed) return;
        this.geo.set({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        });
        this.geoState.set('granted');
      },
      (err) => {
        if (this.destroyRef.destroyed) return;
        this.geoState.set('error');
        this.geoError.set(this.mapGeoError(err));
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 },
    );
  }

  protected submit(): void {
    if (!this.canSubmit()) return;
    const geo = this.geo();
    const place = this.selectedPlace();
    this.ref.close({
      name: this.nameControl.value.trim(),
      latitude: geo?.latitude ?? null,
      longitude: geo?.longitude ?? null,
      venue_name: place ? null : this.venueControl.value.trim(),
      google_place_id: place?.id ?? null,
    });
  }

  protected clearGeo(): void {
    this.geo.set(null);
    this.geoState.set('idle');
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
