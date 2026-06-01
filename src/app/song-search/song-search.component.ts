import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import {
  Observable,
  catchError,
  distinctUntilChanged,
  from,
  map,
  of,
  startWith,
  switchMap,
  timer,
} from 'rxjs';
import { QueueService } from '../queue/queue.service';
import { YoutubeService } from '../youtube/youtube.service';
import { VideoResult } from '../types';
import { formatDuration } from '../utils/format';

const MIN_QUERY_LENGTH = 2;
const SEARCH_DEBOUNCE_MS = 500;

interface SearchState {
  readonly results: ReadonlyArray<VideoResult>;
  readonly searching: boolean;
}

const IDLE_STATE: SearchState = { results: [], searching: false };
const SEARCHING_STATE: SearchState = { results: [], searching: true };

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
export class SongSearchComponent {
  readonly roomId = input.required<string>();

  private readonly queue = inject(QueueService);
  private readonly youtube = inject(YoutubeService);
  private readonly snackBar = inject(MatSnackBar);

  protected readonly searchControl = new FormControl<string>('', { nonNullable: true });

  /** Valor cru do input (sem trim/debounce) — usado pra UI imediata ("Sem resultados…"). */
  private readonly value$ = this.searchControl.valueChanges.pipe(
    startWith(this.searchControl.value),
  );
  protected readonly query = toSignal(this.value$, { initialValue: '' });

  /**
   * Pipeline de busca: debounce 500ms + switchMap cancela in-flight.
   * Queries curtas (< 2 chars) ou vazias resetam state imediatamente, sem debounce.
   */
  private readonly state$: Observable<SearchState> = this.value$.pipe(
    map((v) => v.trim()),
    distinctUntilChanged(),
    switchMap((query) => {
      if (query.length < MIN_QUERY_LENGTH) {
        return of(IDLE_STATE);
      }
      return this.searchFor(query);
    }),
  );
  private readonly state = toSignal(this.state$, { initialValue: IDLE_STATE });

  protected readonly results = computed(() => this.state().results);
  protected readonly searching = computed(() => this.state().searching);

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
      // Resetar o input dispara o pipeline → state volta a IDLE_STATE na hora.
      this.searchControl.setValue('');
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : $localize`:@@common.unknownError:erro desconhecido`;
      this.snackBar.open(
        $localize`:@@mobile.enqueueFailed:Falha ao enfileirar: ${message}:error:`,
        undefined,
        { duration: 4000 },
      );
    }
  }

  /** Debounced fetch para uma query válida. */
  private searchFor(query: string): Observable<SearchState> {
    return timer(SEARCH_DEBOUNCE_MS).pipe(
      switchMap(() =>
        from(this.youtube.search(query)).pipe(
          map((results): SearchState => ({ results, searching: false })),
          catchError((err: unknown) => {
            const message =
              err instanceof Error
                ? err.message
                : $localize`:@@common.unknownError:erro desconhecido`;
            this.snackBar.open(
              $localize`:@@mobile.searchFailed:Busca falhou: ${message}:error:`,
              undefined,
              { duration: 4000 },
            );
            return of(IDLE_STATE);
          }),
          startWith(SEARCHING_STATE),
        ),
      ),
    );
  }
}
