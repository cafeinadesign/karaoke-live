import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import {
  CalendarRoom,
  buildGoogleCalendarUrl,
  downloadIcsFile,
} from '../utils/calendar';

@Component({
  selector: 'app-event-calendar-actions',
  imports: [MatButtonModule, MatIconModule],
  template: `
    @if (googleCalendarUrl(); as url) {
      <div class="calendar-actions">
        <a matButton="tonal" [href]="url" target="_blank" rel="noopener noreferrer">
          <mat-icon>event</mat-icon>
          <span i18n="@@calendar.addGoogle">Adicionar ao Google Agenda</span>
        </a>
        <button matButton="outlined" type="button" (click)="saveIcs()">
          <mat-icon>download</mat-icon>
          <span i18n="@@calendar.downloadIcs">Baixar .ics</span>
        </button>
      </div>
    }
  `,
  styles: `
.calendar-actions
  display: flex
  flex-wrap: wrap
  gap: 8px
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EventCalendarActionsComponent {
  readonly room = input.required<CalendarRoom>();
  private readonly snackBar = inject(MatSnackBar);

  private readonly origin =
    typeof window !== 'undefined' ? window.location.origin : 'https://karaoke-live.app.br';

  protected readonly googleCalendarUrl = computed(() =>
    buildGoogleCalendarUrl(this.room(), this.origin),
  );

  protected saveIcs(): void {
    const ok = downloadIcsFile(this.room(), this.origin);
    if (!ok) {
      this.snackBar.open(
        $localize`:@@calendar.icsFailed:Não foi possível gerar o arquivo do evento.`,
        undefined,
        { duration: 3000 },
      );
    }
  }
}
