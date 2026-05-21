import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatBottomSheet } from '@angular/material/bottom-sheet';
import { YouTubePlayer } from '@angular/youtube-player';
import { AuthService } from '../../auth/auth.service';
import { RoomsService } from '../../rooms/rooms.service';
import { QueueService } from '../../queue/queue.service';
import { YoutubeService } from '../../youtube/youtube.service';
import { SongSearchComponent } from '../../song-search/song-search.component';
import { VersionFooterComponent } from '../../version-footer/version-footer.component';
import { PlaybackBarComponent } from '../../playback-bar/playback-bar.component';
import { formatDuration } from '../../utils/format';
import { ShareSheetComponent, ShareSheetData } from './share-sheet.component';

const YT_STATE_ENDED = 0;

@Component({
  selector: 'app-host-dashboard',
  imports: [
    MatButtonModule,
    MatIconModule,
    MatListModule,
    MatProgressBarModule,
    YouTubePlayer,
    SongSearchComponent,
    VersionFooterComponent,
    PlaybackBarComponent,
  ],
  templateUrl: './host-dashboard.component.html',
  styleUrl: './host-dashboard.component.sass',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HostDashboardComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly rooms = inject(RoomsService);
  protected readonly queue = inject(QueueService);
  private readonly youtube = inject(YoutubeService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly bottomSheet = inject(MatBottomSheet);
  private readonly destroyRef = inject(DestroyRef);

  private readonly player = viewChild(YouTubePlayer);

  protected readonly room = this.rooms.currentRoom;
  protected readonly advancing = signal(false);
  protected readonly elapsed = signal(0);
  protected readonly duration = signal(0);

  protected readonly currentItem = computed(() =>
    this.queue.items().find((i) => i.status === 'now_playing') ?? null,
  );
  protected readonly pendingItems = computed(() =>
    this.queue.items().filter((i) => i.status === 'pending'),
  );
  protected readonly currentVideoId = computed(() => this.currentItem()?.video_id ?? '');
  protected readonly isHost = computed(() => {
    const r = this.room();
    const u = this.auth.user();
    return r !== null && u !== null && r.host_id === u.id;
  });

  private lastRoastedItemId: string | null = null;
  private autoAdvancedItemId: string | null = null;

  constructor() {
    const roomId = this.route.snapshot.paramMap.get('roomId');
    if (roomId) {
      void this.loadRoom(roomId);
    }

    effect(() => {
      const current = this.currentItem();
      if (!current) {
        this.lastRoastedItemId = null;
        return;
      }
      if (this.lastRoastedItemId === current.id) return;
      if (current.gemini_message) {
        this.lastRoastedItemId = current.id;
        return;
      }
      this.lastRoastedItemId = current.id;
      void this.youtube.generateRoast(current.id);
    });

    // Poll the YouTube player for playback position.
    const pollId = window.setInterval(() => {
      const p = this.player();
      if (!p) {
        return;
      }
      const dur = p.getDuration();
      const cur = p.getCurrentTime();
      this.duration.set(Number.isFinite(dur) ? dur : 0);
      this.elapsed.set(Number.isFinite(cur) ? cur : 0);
    }, 500);
    this.destroyRef.onDestroy(() => window.clearInterval(pollId));
  }

  protected onPlayerState(event: YT.OnStateChangeEvent): void {
    if (event.data !== YT_STATE_ENDED) {
      return;
    }
    const current = this.currentItem();
    if (!current || this.autoAdvancedItemId === current.id) {
      return;
    }
    this.autoAdvancedItemId = current.id;
    void this.advance();
  }

  protected async advance(): Promise<void> {
    const room = this.room();
    if (!room) return;
    this.advancing.set(true);
    try {
      await this.queue.advanceNext(room.id);
    } catch (err) {
      const message = err instanceof Error ? err.message : $localize`:@@common.unknownError:erro desconhecido`;
      this.snackBar.open(
        $localize`:@@host.advanceFailed:Falha ao avançar: ${message}:error:`,
        undefined,
        { duration: 4000 },
      );
    } finally {
      this.advancing.set(false);
    }
  }

  protected async remove(itemId: string): Promise<void> {
    try {
      await this.queue.removeItem(itemId);
    } catch (err) {
      const message = err instanceof Error ? err.message : $localize`:@@common.unknownError:erro desconhecido`;
      this.snackBar.open(
        $localize`:@@host.removeFailed:Falha ao remover: ${message}:error:`,
        undefined,
        { duration: 4000 },
      );
    }
  }

  protected formatDuration(seconds: number | null): string {
    return formatDuration(seconds ?? 0);
  }

  protected openShareSheet(): void {
    const code = this.room()?.code;
    if (!code) return;
    const url = `${window.location.origin}/mobile/${code}`;
    this.bottomSheet.open<ShareSheetComponent, ShareSheetData>(ShareSheetComponent, {
      data: { code, url },
    });
  }

  private async loadRoom(roomId: string): Promise<void> {
    const room = await this.rooms.loadRoomById(roomId);
    if (!room) {
      this.snackBar.open(
        $localize`:@@mobile.roomNotFound:Sala não encontrada.`,
        undefined,
        { duration: 3000 },
      );
      await this.router.navigate(['/']);
      return;
    }
    if (room.host_id !== this.auth.user()?.id) {
      this.snackBar.open(
        $localize`:@@host.notHost:Você não é host desta sala.`,
        undefined,
        { duration: 3000 },
      );
      await this.router.navigate(['/']);
      return;
    }
    await this.queue.subscribe(room.id);
  }
}
