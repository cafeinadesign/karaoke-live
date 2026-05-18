import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatBottomSheet, MatBottomSheetRef } from '@angular/material/bottom-sheet';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AuthService } from '../../auth/auth.service';
import { RoomsService } from '../../rooms/rooms.service';
import { QueueService } from '../../queue/queue.service';
import { SongSearchComponent } from '../../song-search/song-search.component';
import { YourTurnSheetComponent, YourTurnData } from './your-turn-sheet.component';
import { QrScannerDialogComponent } from './qr-scanner-dialog.component';

@Component({
  selector: 'app-mobile',
  imports: [
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatListModule,
    MatProgressSpinnerModule,
    SongSearchComponent,
  ],
  templateUrl: './mobile.component.html',
  styleUrl: './mobile.component.sass',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MobileComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly rooms = inject(RoomsService);
  protected readonly queue = inject(QueueService);
  private readonly bottomSheet = inject(MatBottomSheet);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);

  protected readonly codeControl = new FormControl<string>('', {
    nonNullable: true,
    validators: [Validators.required, Validators.minLength(6), Validators.maxLength(6)],
  });

  protected readonly joining = signal(false);
  protected readonly room = this.rooms.currentRoom;

  protected readonly currentItem = computed(() =>
    this.queue.items().find((i) => i.status === 'now_playing') ?? null,
  );
  protected readonly myItems = computed(() => {
    const userId = this.auth.user()?.id;
    if (!userId) return [];
    return this.queue.items().filter((i) => i.user_id === userId);
  });
  protected readonly isMyTurn = computed(() => {
    const current = this.currentItem();
    return current !== null && current.user_id === this.auth.user()?.id;
  });

  private sheetRef: MatBottomSheetRef<YourTurnSheetComponent, void> | null = null;
  private shownTurnForItemId: string | null = null;

  constructor() {
    const code = this.route.snapshot.paramMap.get('code');
    if (code) {
      void this.tryJoin(code);
    }

    effect(() => {
      const current = this.currentItem();
      const mine = this.isMyTurn();
      if (!mine || !current) {
        if (this.sheetRef && !this.isMyTurn()) {
          this.sheetRef.dismiss();
          this.sheetRef = null;
          this.shownTurnForItemId = null;
        }
        return;
      }
      if (this.shownTurnForItemId === current.id) {
        return;
      }
      this.shownTurnForItemId = current.id;
      this.sheetRef = this.bottomSheet.open<YourTurnSheetComponent, YourTurnData>(
        YourTurnSheetComponent,
        { data: { item: current }, disableClose: false, hasBackdrop: true },
      );
    });
  }

  protected async submitCode(): Promise<void> {
    if (this.codeControl.invalid) return;
    await this.tryJoin(this.codeControl.value);
  }

  protected async openScanner(): Promise<void> {
    const ref = this.dialog.open<QrScannerDialogComponent, void, string | null>(
      QrScannerDialogComponent,
      { panelClass: 'qr-dialog-panel', autoFocus: false, restoreFocus: false },
    );
    const code = await ref.afterClosed().toPromise();
    if (code) {
      this.codeControl.setValue(code);
      await this.tryJoin(code);
    }
  }

  protected statusLabel(status: string): string {
    switch (status) {
      case 'pending': return $localize`:@@status.pending:Aguardando`;
      case 'now_playing': return $localize`:@@status.nowPlaying:Cantando agora`;
      case 'done': return $localize`:@@status.done:Feita`;
      case 'skipped': return $localize`:@@status.skipped:Pulada`;
      default: return status;
    }
  }

  private async tryJoin(code: string): Promise<void> {
    this.joining.set(true);
    try {
      const room = await this.rooms.joinByCode(code);
      await this.queue.subscribe(room.id);
      await this.router.navigate(['/mobile', room.code], { replaceUrl: true });
    } catch {
      this.snackBar.open(
        $localize`:@@mobile.roomNotFound:Sala não encontrada.`,
        undefined,
        { duration: 3000 },
      );
    } finally {
      this.joining.set(false);
    }
  }
}
