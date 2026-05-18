import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  inject,
  input,
  signal,
} from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Subscription } from 'rxjs';
import { QueueService } from '../queue/queue.service';
import { YoutubeService } from '../youtube/youtube.service';
import { VideoResult } from '../types';
import { formatDuration } from '../utils/format';

@Component({
  selector: 'app-song-search',
  imports: [
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    MatListModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './song-search.component.html',
  styleUrl: './song-search.component.sass',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SongSearchComponent implements OnDestroy {
  readonly roomId = input.required<string>();

  private readonly queue = inject(QueueService);
  private readonly youtube = inject(YoutubeService);
  private readonly snackBar = inject(MatSnackBar);

  protected readonly searchControl = new FormControl<string>('', { nonNullable: true });
  protected readonly results = signal<ReadonlyArray<VideoResult>>([]);
  protected readonly searching = signal(false);

  private searchTimer: number | null = null;
  private readonly valueSub: Subscription;

  constructor() {
    this.valueSub = this.searchControl.valueChanges.subscribe((value) => {
      if (this.searchTimer !== null) clearTimeout(this.searchTimer);
      this.searchTimer = window.setTimeout(() => {
        void this.performSearch(value);
      }, 400);
    });
  }

  ngOnDestroy(): void {
    this.valueSub.unsubscribe();
    if (this.searchTimer !== null) clearTimeout(this.searchTimer);
  }

  protected formatDuration(seconds: number | null): string {
    return formatDuration(seconds ?? 0);
  }

  protected async enqueue(video: VideoResult): Promise<void> {
    try {
      await this.queue.enqueue(this.roomId(), video);
      this.snackBar.open(
        $localize`:@@mobile.enqueued:"${video.title}:title:" entrou na fila.`,
        undefined,
        { duration: 2500 },
      );
      this.searchControl.setValue('', { emitEvent: false });
      this.results.set([]);
    } catch (err) {
      const message = err instanceof Error ? err.message : $localize`:@@common.unknownError:erro desconhecido`;
      this.snackBar.open(
        $localize`:@@mobile.enqueueFailed:Falha ao enfileirar: ${message}:error:`,
        undefined,
        { duration: 4000 },
      );
    }
  }

  private async performSearch(query: string): Promise<void> {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      this.results.set([]);
      return;
    }
    this.searching.set(true);
    try {
      const results = await this.youtube.search(trimmed);
      this.results.set(results);
    } catch (err) {
      const message = err instanceof Error ? err.message : $localize`:@@common.unknownError:erro desconhecido`;
      this.snackBar.open(
        $localize`:@@mobile.searchFailed:Busca falhou: ${message}:error:`,
        undefined,
        { duration: 4000 },
      );
    } finally {
      this.searching.set(false);
    }
  }
}
