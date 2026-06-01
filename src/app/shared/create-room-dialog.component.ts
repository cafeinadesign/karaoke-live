import {
  ChangeDetectionStrategy,
  Component,
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

export interface CreateRoomDialogResult {
  readonly name: string;
  readonly latitude: number;
  readonly longitude: number;
}

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

      <div class="geo">
        <span class="geo-label" i18n="@@createRoom.geoLabel">Localização</span>

        @switch (geoState()) {
          @case ('idle') {
            <button matButton="tonal" type="button" (click)="requestGeo()">
              <mat-icon>my_location</mat-icon>
              <span i18n="@@createRoom.geoRequest">Usar minha localização</span>
            </button>
            <p class="hint" i18n="@@createRoom.geoWhy">
              A gente usa pra mapear onde as noites de karaokê estão rolando.
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
              <span class="coords"
                >{{ formatCoord(geo()!.latitude) }}, {{ formatCoord(geo()!.longitude) }}</span
              >
              <button
                matIconButton
                type="button"
                (click)="requestGeo()"
                i18n-aria-label="@@createRoom.geoRefresh"
                aria-label="Atualizar localização"
              >
                <mat-icon>refresh</mat-icon>
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

.geo
  display: flex
  flex-direction: column
  gap: 8px
  margin-top: 4px

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

.coords
  font-family: 'Roboto Mono', monospace
  font-weight: 500
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CreateRoomDialogComponent {
  private readonly ref = inject(MatDialogRef) as MatDialogRef<
    CreateRoomDialogComponent,
    CreateRoomDialogResult | null
  >;

  protected readonly nameControl = new FormControl<string>('', {
    nonNullable: true,
    validators: [Validators.required, Validators.maxLength(80)],
  });

  protected readonly nameValue = toSignal(this.nameControl.valueChanges, {
    initialValue: this.nameControl.value,
  });

  protected readonly geoState = signal<GeoState>('idle');
  protected readonly geo = signal<{ latitude: number; longitude: number } | null>(null);
  protected readonly geoError = signal<string>('');

  protected readonly canSubmit = computed(
    () =>
      this.nameValue().trim().length > 0 &&
      this.geoState() === 'granted' &&
      this.geo() !== null,
  );

  protected requestGeo(): void {
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
        this.geo.set({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        });
        this.geoState.set('granted');
      },
      (err) => {
        this.geoState.set('error');
        this.geoError.set(this.mapGeoError(err));
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 },
    );
  }

  protected submit(): void {
    if (!this.canSubmit()) return;
    const g = this.geo();
    if (!g) return;
    this.ref.close({
      name: this.nameControl.value.trim(),
      latitude: g.latitude,
      longitude: g.longitude,
    });
  }

  protected formatCoord(n: number): string {
    return n.toFixed(5);
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
