import {
  ChangeDetectionStrategy,
  Component,
  inject,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { QueueService } from '../queue/queue.service';
import { SongSearchComponent } from '../song-search/song-search.component';
import { VideoResult } from '../types';

export interface ReplaceVideoDialogData {
  readonly itemId: string;
  readonly roomId: string;
  readonly currentTitle: string;
}

@Component({
  selector: 'app-replace-video-dialog',
  imports: [MatButtonModule, MatDialogModule, SongSearchComponent],
  template: `
    <h2 mat-dialog-title i18n="@@replaceVideo.title">Trocar música</h2>
    <mat-dialog-content>
      <p class="current">
        <span class="label" i18n="@@replaceVideo.currentLabel">Atual:</span>
        <span class="title">{{ data.currentTitle }}</span>
      </p>
      <p class="hint" i18n="@@replaceVideo.hint">
        Escolha a nova. Sua posição na fila é mantida.
      </p>
      <app-song-search [roomId]="data.roomId" mode="pick" (picked)="onPicked($event)" />
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button matButton type="button" [mat-dialog-close]="null" i18n="@@common.cancel">
        Cancelar
      </button>
    </mat-dialog-actions>
  `,
  styles: `
:host
  display: block

mat-dialog-content
  min-width: 280px

.current
  margin: 0 0 8px
  font-size: 14px

  .label
    color: var(--mat-sys-on-surface-variant)
    margin-right: 4px
    text-transform: uppercase
    font-size: 11px
    letter-spacing: 0.4px

  .title
    font-weight: 500

.hint
  margin: 0 0 12px
  color: var(--mat-sys-on-surface-variant)
  font-size: 13px
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReplaceVideoDialogComponent {
  protected readonly data = inject<ReplaceVideoDialogData>(MAT_DIALOG_DATA);
  private readonly queue = inject(QueueService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly ref = inject(MatDialogRef) as MatDialogRef<ReplaceVideoDialogComponent>;

  protected async onPicked(video: VideoResult): Promise<void> {
    try {
      await this.queue.replaceItemVideo(this.data.itemId, video);
      this.snackBar.open(
        $localize`:@@replaceVideo.success:Música trocada para "${video.title}:title:".`,
        undefined,
        { duration: 2500 },
      );
      this.ref.close();
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : $localize`:@@common.unknownError:erro desconhecido`;
      this.snackBar.open(
        $localize`:@@replaceVideo.failed:Falha ao trocar: ${message}:error:`,
        undefined,
        { duration: 4000 },
      );
    }
  }
}
