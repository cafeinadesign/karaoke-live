import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
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
import { formatDuration } from '../../utils/format';
import { ShareSheetComponent, ShareSheetData } from './share-sheet.component';

@Component({
  selector: 'app-host-dashboard',
  imports: [
    MatButtonModule,
    MatIconModule,
    MatListModule,
    MatProgressBarModule,
    YouTubePlayer,
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

  protected readonly room = this.rooms.currentRoom;
  protected readonly advancing = signal(false);

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
  }

  protected async advance(): Promise<void> {
    const room = this.room();
    if (!room) return;
    this.advancing.set(true);
    try {
      await this.queue.advanceNext(room.id);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'erro_desconhecido';
      this.snackBar.open(`Falha ao avançar: ${message}`, undefined, { duration: 4000 });
    } finally {
      this.advancing.set(false);
    }
  }

  protected async remove(itemId: string): Promise<void> {
    try {
      await this.queue.removeItem(itemId);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'erro_desconhecido';
      this.snackBar.open(`Falha ao remover: ${message}`, undefined, { duration: 4000 });
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
      this.snackBar.open('Sala não encontrada.', undefined, { duration: 3000 });
      await this.router.navigate(['/']);
      return;
    }
    if (room.host_id !== this.auth.user()?.id) {
      this.snackBar.open('Você não é host desta sala.', undefined, { duration: 3000 });
      await this.router.navigate(['/']);
      return;
    }
    await this.queue.subscribe(room.id);
  }
}
