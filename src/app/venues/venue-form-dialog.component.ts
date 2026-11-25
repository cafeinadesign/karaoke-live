import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatRadioModule } from '@angular/material/radio';
import { MatSelectModule } from '@angular/material/select';
import { Coordinates, VenueMapComponent } from '../places/venue-map.component';
import { NewVenue, NewVenueSchedule } from '../types';
import { getLocalTimeZone } from '../utils/calendar';
import { getWeekdayFullLabel } from '../utils/venue-schedule';
import { VenueWithDetails } from './venues.service';

export interface VenueFormDialogData {
  readonly venue?: VenueWithDetails;
}

export interface VenueFormDialogResult {
  readonly venue: Omit<NewVenue, 'slug'>;
  readonly schedules: ReadonlyArray<NewVenueSchedule>;
}

interface ScheduleDraft {
  day_of_week: number;
  start_time: string;
  duration_minutes: number;
  label: string;
}

const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6] as const;
const DURATION_OPTIONS = [
  { minutes: 120, label: '2h' },
  { minutes: 180, label: '3h' },
  { minutes: 240, label: '4h' },
  { minutes: 360, label: '6h' },
] as const;

@Component({
  selector: 'app-venue-form-dialog',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatRadioModule,
    MatSelectModule,
    VenueMapComponent,
  ],
  template: `
    <h2 mat-dialog-title>
      @if (isEdit) {
        <ng-container i18n="@@venueForm.editTitle">Editar estabelecimento</ng-container>
      } @else {
        <ng-container i18n="@@venueForm.createTitle">Cadastrar estabelecimento</ng-container>
      }
    </h2>
    <mat-dialog-content>
      <form id="venue-form" (ngSubmit)="submit()">
        <mat-form-field appearance="outline" class="full-width">
          <mat-label i18n="@@venueForm.nameLabel">Nome do estabelecimento</mat-label>
          <input
            matInput
            type="text"
            maxlength="160"
            required
            [formControl]="nameControl"
            i18n-placeholder="@@venueForm.namePlaceholder"
            placeholder="Bar do Zé, Karaokê da Vila…"
          />
        </mat-form-field>

        <mat-form-field appearance="outline" class="full-width">
          <mat-label i18n="@@venueForm.descriptionLabel">Descrição (opcional)</mat-label>
          <textarea
            matInput
            rows="2"
            maxlength="500"
            [formControl]="descriptionControl"
            i18n-placeholder="@@venueForm.descriptionPlaceholder"
            placeholder="Karaokê com telão, drinks e microfone aberto…"
          ></textarea>
        </mat-form-field>

        <mat-form-field appearance="outline" class="full-width">
          <mat-label i18n="@@venueForm.addressLabel">Endereço (opcional)</mat-label>
          <input
            matInput
            type="text"
            maxlength="240"
            [formControl]="addressControl"
            i18n-placeholder="@@venueForm.addressPlaceholder"
            placeholder="Rua das Flores, 123 - Centro"
          />
        </mat-form-field>

        <mat-form-field appearance="outline" class="full-width">
          <mat-label i18n="@@venueForm.instagramLabel">Instagram (opcional)</mat-label>
          <input
            matInput
            type="text"
            maxlength="60"
            [formControl]="instagramControl"
            placeholder="@bardose"
          />
        </mat-form-field>

        <fieldset class="schedules-fieldset">
          <legend class="section-label" i18n="@@venueForm.schedulesLegend">
            Horários semanais de karaokê
          </legend>

          @for (item of schedules(); track $index) {
            <div class="schedule-item-row">
              <mat-form-field appearance="outline" class="day-field">
                <mat-label i18n="@@venueForm.dayLabel">Dia</mat-label>
                <mat-select
                  [value]="item.day_of_week"
                  (selectionChange)="updateSchedule($index, { day_of_week: $event.value })"
                >
                  @for (day of weekdays; track day) {
                    <mat-option [value]="day">{{ weekdayLabel(day) }}</mat-option>
                  }
                </mat-select>
              </mat-form-field>

              <mat-form-field appearance="outline" class="time-field">
                <mat-label i18n="@@venueForm.timeLabel">Início</mat-label>
                <input
                  matInput
                  type="time"
                  [value]="item.start_time"
                  (input)="updateSchedule($index, { start_time: $any($event.target).value })"
                />
              </mat-form-field>

              <mat-form-field appearance="outline" class="duration-field">
                <mat-label i18n="@@venueForm.durationLabel">Duração</mat-label>
                <mat-select
                  [value]="item.duration_minutes"
                  (selectionChange)="updateSchedule($index, { duration_minutes: $event.value })"
                >
                  @for (opt of durationOptions; track opt.minutes) {
                    <mat-option [value]="opt.minutes">{{ opt.label }}</mat-option>
                  }
                </mat-select>
              </mat-form-field>

              <button
                mat-icon-button
                type="button"
                (click)="removeSchedule($index)"
                [disabled]="schedules().length <= 1"
                i18n-aria-label="@@venueForm.removeScheduleAria"
                aria-label="Remover horário"
              >
                <mat-icon>delete_outline</mat-icon>
              </button>
            </div>
          }

          <button matButton="outlined" type="button" (click)="addSchedule()">
            <mat-icon>add</mat-icon>
            <span i18n="@@venueForm.addSchedule">Adicionar dia/horário</span>
          </button>
        </fieldset>

        <fieldset class="visibility-fieldset">
          <legend class="section-label" i18n="@@venueForm.visibilityLegend">Visibilidade</legend>
          <mat-radio-group [formControl]="isPublicControl" class="visibility-group">
            <mat-radio-button [value]="true">
              <span i18n="@@venueForm.publicOption">Público (aparece na vitrine e busca)</span>
            </mat-radio-button>
            <mat-radio-button [value]="false">
              <span i18n="@@venueForm.privateOption">Oculto (acesso apenas pelo link)</span>
            </mat-radio-button>
          </mat-radio-group>
        </fieldset>

        <div class="geo-section">
          <span class="section-label" i18n="@@venueForm.locationLabel">
            Localização no mapa (opcional)
          </span>
          @if (coordinates(); as coords) {
            <app-venue-map
              [point]="coords"
              (picked)="coordinates.set($event)"
            />
            <button matButton="text" type="button" (click)="clearLocation()">
              <mat-icon>close</mat-icon>
              <span i18n="@@venueForm.clearLocation">Remover localização</span>
            </button>
          } @else {
            <button
              matButton="outlined"
              type="button"
              (click)="requestLocation()"
              [disabled]="geoLoading()"
            >
              <mat-icon>my_location</mat-icon>
              <span i18n="@@venueForm.useMyLocation">Usar minha localização atual</span>
            </button>
            @if (geoError()) {
              <p class="geo-error" role="status">{{ geoError() }}</p>
            }
          }
        </div>
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button matButton="text" type="button" mat-dialog-close i18n="@@common.cancel">
        Cancelar
      </button>
      <button
        matButton="filled"
        type="button"
        [disabled]="nameControl.invalid"
        (click)="submit()"
        i18n="@@common.save"
      >
        Salvar
      </button>
    </mat-dialog-actions>
  `,
  styles: `
mat-dialog-content
  min-width: min(460px, 85vw)
  padding-top: 8px

.full-width
  width: 100%

.section-label
  display: block
  font-size: 0.875rem
  font-weight: 500
  margin-bottom: 8px
  color: var(--mat-sys-on-surface-variant)

.schedules-fieldset,
.visibility-fieldset
  border: none
  padding: 0
  margin: 8px 0 16px

.schedule-item-row
  display: flex
  gap: 8px
  align-items: center
  flex-wrap: wrap
  margin-bottom: 8px

.day-field
  flex: 1 1 130px

.time-field
  flex: 0 1 110px

.duration-field
  flex: 0 1 95px

.visibility-group
  display: flex
  flex-direction: column
  gap: 6px

.geo-section
  display: flex
  flex-direction: column
  gap: 8px
  margin-top: 8px

.geo-error
  color: var(--mat-sys-error)
  font-size: 0.85rem
  margin: 0
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VenueFormDialogComponent {
  private readonly dialogRef = inject(MatDialogRef<VenueFormDialogComponent, VenueFormDialogResult>);
  private readonly data = inject<VenueFormDialogData | null>(MAT_DIALOG_DATA, { optional: true });
  private readonly destroyRef = inject(DestroyRef);

  protected readonly isEdit = Boolean(this.data?.venue);
  protected readonly weekdays = WEEKDAYS;
  protected readonly durationOptions = DURATION_OPTIONS;

  protected readonly nameControl = new FormControl(this.data?.venue?.name ?? '', {
    nonNullable: true,
    validators: [Validators.required, Validators.maxLength(160)],
  });
  protected readonly nameValue = toSignal(this.nameControl.valueChanges, {
    initialValue: this.nameControl.value,
  });

  protected readonly descriptionControl = new FormControl(this.data?.venue?.description ?? '', {
    nonNullable: true,
  });
  protected readonly addressControl = new FormControl(this.data?.venue?.address ?? '', {
    nonNullable: true,
  });
  protected readonly instagramControl = new FormControl(
    this.data?.venue?.instagram_handle ?? '',
    { nonNullable: true },
  );
  protected readonly isPublicControl = new FormControl(this.data?.venue?.is_public ?? true, {
    nonNullable: true,
  });

  protected readonly schedules = signal<ScheduleDraft[]>(
    this.data?.venue?.schedules.length
      ? this.data.venue.schedules.map((s) => ({
          day_of_week: s.day_of_week,
          start_time: s.start_time,
          duration_minutes: s.duration_minutes,
          label: s.label ?? '',
        }))
      : [{ day_of_week: 4, start_time: '20:00', duration_minutes: 240, label: '' }],
  );

  protected readonly coordinates = signal<Coordinates | null>(
    this.data?.venue?.latitude != null && this.data?.venue?.longitude != null
      ? { latitude: this.data.venue.latitude, longitude: this.data.venue.longitude }
      : null,
  );
  protected readonly googlePlaceId = signal<string | null>(
    this.data?.venue?.google_place_id ?? null,
  );
  protected readonly geoLoading = signal(false);
  protected readonly geoError = signal('');

  protected weekdayLabel(day: number): string {
    return getWeekdayFullLabel(day);
  }

  protected addSchedule(): void {
    this.schedules.update((list) => [
      ...list,
      { day_of_week: 5, start_time: '20:00', duration_minutes: 240, label: '' },
    ]);
  }

  protected removeSchedule(index: number): void {
    if (this.schedules().length <= 1) return;
    this.schedules.update((list) => list.filter((_, i) => i !== index));
  }

  protected updateSchedule(index: number, patch: Partial<ScheduleDraft>): void {
    this.schedules.update((list) =>
      list.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    );
  }

  protected onPlaceSelected(place: { name: string; placeId: string }): void {
    this.googlePlaceId.set(place.placeId);
    if (!this.nameControl.value.trim()) {
      this.nameControl.setValue(place.name);
    }
  }

  protected clearLocation(): void {
    this.coordinates.set(null);
    this.googlePlaceId.set(null);
  }

  protected requestLocation(): void {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      this.geoError.set(
        $localize`:@@createRoom.geoUnsupported:Geolocalização não está disponível neste dispositivo.`,
      );
      return;
    }
    this.geoLoading.set(true);
    this.geoError.set('');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (this.destroyRef.destroyed) return;
        this.geoLoading.set(false);
        this.coordinates.set({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        });
      },
      () => {
        if (this.destroyRef.destroyed) return;
        this.geoLoading.set(false);
        this.geoError.set(
          $localize`:@@landing.geoFailed:Não foi possível obter sua localização agora.`,
        );
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }

  protected submit(): void {
    if (this.nameControl.invalid) return;
    const coords = this.coordinates();
    const rawIg = this.instagramControl.value.trim().replace(/^@+/, '');

    this.dialogRef.close({
      venue: {
        name: this.nameControl.value.trim(),
        description: this.descriptionControl.value.trim() || null,
        address: this.addressControl.value.trim() || null,
        instagram_handle: rawIg || null,
        latitude: coords?.latitude ?? null,
        longitude: coords?.longitude ?? null,
        google_place_id: this.googlePlaceId(),
        timezone: this.data?.venue?.timezone ?? getLocalTimeZone(),
        is_public: this.isPublicControl.value,
      },
      schedules: this.schedules().map((s) => ({
        day_of_week: s.day_of_week,
        start_time: s.start_time,
        duration_minutes: s.duration_minutes,
        label: s.label.trim() || null,
      })),
    });
  }
}
