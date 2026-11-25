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
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatRadioModule } from '@angular/material/radio';
import { MatSelectModule } from '@angular/material/select';

import { NewRoom } from '../types';
import { Coordinates, VenueMapComponent } from '../places/venue-map.component';
import {
  DEFAULT_EVENT_DURATION_HOURS,
  ensureTemporal,
  getLocalTimeZone,
  resolveEventInterval,
} from '../utils/calendar';

export type CreateRoomDialogResult = NewRoom;

type GeoState = 'idle' | 'loading' | 'granted' | 'denied' | 'error';
type CreateMode = 'now' | 'event';

const DURATION_OPTIONS = [2, 3, 4, 6] as const;

function defaultEventInputs(): { date: string; time: string } {
  const target = new Date(Date.now() + 2 * 3_600_000);
  target.setMinutes(0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    date: `${target.getFullYear()}-${pad(target.getMonth() + 1)}-${pad(target.getDate())}`,
    time: `${pad(target.getHours())}:00`,
  };
}

function todayDateInput(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

@Component({
  selector: 'app-create-room-dialog',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatRadioModule,
    MatSelectModule,
    VenueMapComponent,
  ],
  template: `
    <h2 mat-dialog-title i18n="@@createRoom.title">Criar sala</h2>
    <mat-dialog-content>
      <form id="create-room-form" (ngSubmit)="submit()">
        <div class="mode-switch">
          <mat-button-toggle-group
            [value]="mode()"
            (change)="setMode($event.value)"
            i18n-aria-label="@@createRoom.modeAriaLabel"
            aria-label="Tipo de criação"
          >
            <mat-button-toggle value="now">
              <mat-icon>play_circle</mat-icon>
              <span i18n="@@createRoom.modeNow">Começar agora</span>
            </mat-button-toggle>
            <mat-button-toggle value="event">
              <mat-icon>event</mat-icon>
              <span i18n="@@createRoom.modeEvent">Evento</span>
            </mat-button-toggle>
          </mat-button-toggle-group>
        </div>

        <mat-form-field appearance="outline" class="name-field">
          <mat-label i18n="@@createRoom.nameLabel">Nome da sala</mat-label>
          <input
            matInput
            type="text"
            name="roomName"
            maxlength="80"
            required
            [formControl]="nameControl"
            i18n-placeholder="@@createRoom.namePlaceholder"
            placeholder="Aniversário da Lu, terça no bar…"
          />
          <mat-hint align="end">{{ nameValue().length }} / 80</mat-hint>
        </mat-form-field>

        @if (mode() === 'event') {
          <fieldset class="schedule">
            <legend class="geo-label" i18n="@@createRoom.scheduleLegend">
              Data e horário (Google Agenda)
            </legend>
            <div class="schedule-row">
              <mat-form-field appearance="outline">
                <mat-label i18n="@@createRoom.dateLabel">Data</mat-label>
                <input
                  matInput
                  type="date"
                  name="eventDate"
                  [min]="minDate"
                  required
                  [formControl]="dateControl"
                  aria-describedby="schedule-hint"
                />
              </mat-form-field>
              <mat-form-field appearance="outline">
                <mat-label i18n="@@createRoom.timeLabel">Horário</mat-label>
                <input
                  matInput
                  type="time"
                  name="eventTime"
                  required
                  [formControl]="timeControl"
                  aria-describedby="schedule-hint"
                />
              </mat-form-field>
              <mat-form-field appearance="outline">
                <mat-label i18n="@@createRoom.durationLabel">Duração</mat-label>
                <mat-select [formControl]="durationControl">
                  @for (hours of durationOptions; track hours) {
                    <mat-option [value]="hours">
                      {{ hours }}h
                    </mat-option>
                  }
                </mat-select>
              </mat-form-field>
            </div>
            <p id="schedule-hint" class="hint" i18n="@@createRoom.timezoneHint">
              Fuso horário: {{ localTimeZone }}. Os convidados poderão pré-enfileirar músicas antes do início.
            </p>
            @if (scheduleError(); as errMsg) {
              <p role="alert" class="schedule-error">{{ errMsg }}</p>
            } @else if (resolvedInterval()?.hasDstConflict) {
              <p role="status" class="hint" i18n="@@createRoom.dstNotice">
                Horário próximo à mudança de horário de verão; ajustado automaticamente.
              </p>
            }
          </fieldset>
        }

        <fieldset class="venue">
          <legend class="geo-label" i18n="@@venue.label">Local da sala</legend>
          <mat-form-field appearance="outline" class="name-field">
            <mat-label i18n="@@venue.manual">Nome ou endereço do local</mat-label>
            <input matInput type="text" name="venueName" required maxlength="160" [formControl]="venueControl" />
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
        </fieldset>

        <fieldset class="visibility">
          <legend class="geo-label" i18n="@@createRoom.visibilityLegend">Visibilidade</legend>
          <mat-radio-group name="visibility" [formControl]="publicControl" class="visibility-group">
            <mat-radio-button [value]="false" i18n="@@createRoom.visibilityPrivate">
              Só por convite (link, QR ou código)
            </mat-radio-button>
            <mat-radio-button [value]="true" i18n="@@createRoom.visibilityPublic">
              Público (aparece na lista de eventos)
            </mat-radio-button>
          </mat-radio-group>
        </fieldset>
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button matButton type="button" [mat-dialog-close]="null" i18n="@@common.cancel">Cancelar</button>
      <button matButton="filled" type="button" [disabled]="!canSubmit()" (click)="submit()">
        <mat-icon>{{ mode() === 'event' ? 'event_available' : 'add_circle' }}</mat-icon>
        @if (mode() === 'event') {
          <span i18n="@@createRoom.submitEvent">Criar evento</span>
        } @else {
          <span i18n="@@createRoom.submit">Criar sala</span>
        }
      </button>
    </mat-dialog-actions>
  `,
  styles: `
.mode-switch
  display: flex
  justify-content: center
  margin-bottom: 16px

  mat-button-toggle-group
    width: 100%

  mat-button-toggle
    flex: 1

.name-field
  width: 100%

fieldset
  border: 0
  padding: 0
  margin: 0

.schedule
  display: flex
  flex-direction: column
  gap: 8px
  margin-bottom: 12px

.schedule-row
  display: grid
  grid-template-columns: 1fr 1fr
  gap: 8px

  mat-form-field:last-child
    grid-column: 1 / -1

@media (min-width: 520px)
  .schedule-row
    grid-template-columns: 1.3fr 1fr 0.9fr

    mat-form-field:last-child
      grid-column: auto

.schedule-error
  margin: 0
  font-size: 13px
  color: var(--mat-sys-error, #ffb4ab)

.venue
  display: flex
  flex-direction: column
  gap: 8px
  margin-top: 4px
  align-items: stretch
  margin-bottom: 12px

  > button
    align-self: flex-start

.visibility
  display: flex
  flex-direction: column
  gap: 6px
  margin-bottom: 8px

.visibility-group
  display: flex
  flex-direction: column
  gap: 4px

.geo-label
  font-size: 12px
  color: var(--mat-sys-on-surface-variant)
  text-transform: uppercase
  letter-spacing: 0.4px
  margin-bottom: 6px

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
  private readonly defaults = defaultEventInputs();
  protected readonly minDate = todayDateInput();
  protected readonly durationOptions = DURATION_OPTIONS;
  protected readonly localTimeZone = getLocalTimeZone();

  protected readonly mode = signal<CreateMode>('now');

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

  protected readonly dateControl = new FormControl<string>(this.defaults.date, {
    nonNullable: true,
    validators: [Validators.required],
  });
  protected readonly dateValue = toSignal(this.dateControl.valueChanges, {
    initialValue: this.dateControl.value,
  });

  protected readonly timeControl = new FormControl<string>(this.defaults.time, {
    nonNullable: true,
    validators: [Validators.required],
  });
  protected readonly timeValue = toSignal(this.timeControl.valueChanges, {
    initialValue: this.timeControl.value,
  });

  protected readonly durationControl = new FormControl<number>(DEFAULT_EVENT_DURATION_HOURS, {
    nonNullable: true,
  });
  protected readonly durationValue = toSignal(this.durationControl.valueChanges, {
    initialValue: this.durationControl.value,
  });

  protected readonly publicControl = new FormControl<boolean>(false, { nonNullable: true });
  protected readonly publicValue = toSignal(this.publicControl.valueChanges, {
    initialValue: this.publicControl.value,
  });

  protected readonly geoState = signal<GeoState>('idle');
  protected readonly geo = signal<Coordinates | null>(null);
  protected readonly lookingUpAddress = signal(false);
  protected readonly geoError = signal<string>('');
  protected readonly scheduleTouched = signal(false);

  protected readonly resolvedInterval = computed(() => {
    if (this.mode() !== 'event') return null;
    return resolveEventInterval(
      this.dateValue(),
      this.timeValue(),
      this.durationValue(),
      this.localTimeZone,
    );
  });

  protected readonly scheduleInvalidReason = computed(() => {
    if (this.mode() !== 'event') return null;
    const interval = this.resolvedInterval();
    if (!interval) {
      return $localize`:@@createRoom.scheduleRequired:Informe data e horário válidos para o evento.`;
    }
    const startMs = new Date(interval.startIso).getTime();
    if (startMs <= Date.now() - 60_000) {
      return $localize`:@@createRoom.schedulePast:Escolha uma data e horário no futuro.`;
    }
    return null;
  });

  protected readonly scheduleError = computed(() => {
    const reason = this.scheduleInvalidReason();
    if (!reason) return null;
    if (!this.scheduleTouched() && !this.dateControl.dirty && !this.timeControl.dirty) {
      return null;
    }
    return reason;
  });

  protected readonly canSubmit = computed(() => {
    const baseValid =
      this.nameValue().trim().length > 0 &&
      this.nameControl.valid &&
      this.venueValue().trim().length > 0 &&
      this.venueControl.valid;
    if (!baseValid) return false;
    if (this.mode() === 'event') {
      return this.scheduleInvalidReason() === null;
    }
    return true;
  });

  constructor() {
    this.requestGeo();
    if (typeof window !== 'undefined') {
      void ensureTemporal();
    }
  }

  protected setMode(mode: CreateMode): void {
    this.mode.set(mode);
    this.scheduleTouched.set(false);
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
    if (this.mode() === 'event') {
      this.scheduleTouched.set(true);
    }
    if (!this.canSubmit()) return;

    const geo = this.geo();
    const isPublic = this.publicValue();
    const result: CreateRoomDialogResult = {
      name: this.nameControl.value.trim(),
      latitude: geo?.latitude ?? null,
      longitude: geo?.longitude ?? null,
      venue_name: this.venueControl.value.trim(),
      google_place_id: null,
      ...(isPublic ? { is_public: true } : {}),
    };

    if (this.mode() === 'event') {
      const interval = this.resolvedInterval();
      if (!interval) return;
      this.ref.close({
        ...result,
        scheduled_at: interval.startIso,
        scheduled_end_at: interval.endIso,
        event_timezone: interval.timeZone,
        started_at: null,
      });
      return;
    }

    this.ref.close(result);
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
