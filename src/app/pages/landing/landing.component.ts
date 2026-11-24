import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AuthService } from '../../auth/auth.service';
import { RoomMembership, RoomsService } from '../../rooms/rooms.service';
import {
  CreateRoomDialogComponent,
  CreateRoomDialogResult,
} from '../../shared/create-room-dialog.component';
import { VersionFooterComponent } from '../../version-footer/version-footer.component';

@Component({
  selector: 'app-landing',
  imports: [MatButtonModule, MatIconModule, RouterLink, VersionFooterComponent],
  templateUrl: './landing.component.html',
  styleUrl: './landing.component.sass',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LandingComponent {
  protected readonly auth = inject(AuthService);
  private readonly rooms = inject(RoomsService);
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);

  protected readonly memberships = signal<RoomMembership[] | null>(null);
  protected readonly membershipsFailed = signal(false);
  private readonly refresh = signal(0);

  constructor() {
    effect((onCleanup) => {
      const userId = this.auth.user()?.id;
      this.refresh();
      this.memberships.set(null);
      this.membershipsFailed.set(false);
      if (!userId) return;

      let current = true;
      onCleanup(() => { current = false; });
      void this.rooms.listMemberships(userId).then(
        (memberships) => {
          if (current) this.memberships.set(memberships);
        },
        () => {
          if (current) this.membershipsFailed.set(true);
        },
      );
    });
  }

  protected retryMemberships(): void {
    this.refresh.update((version) => version + 1);
  }

  async signIn(): Promise<void> {
    await this.auth.signInWithGoogle();
  }

  async signOut(): Promise<void> {
    await this.auth.signOut();
  }

  async hostNewRoom(): Promise<void> {
    const ref = this.dialog.open<
      CreateRoomDialogComponent,
      void,
      CreateRoomDialogResult | null
    >(CreateRoomDialogComponent, {
      autoFocus: 'first-tabbable',
      restoreFocus: false,
    });
    const result = (await ref.afterClosed().toPromise()) ?? null;
    if (!result) return;

    try {
      const room = await this.rooms.createRoom(
        result.name,
        result.latitude,
        result.longitude,
      );
      await this.router.navigate(['/host-dashboard', room.id]);
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : $localize`:@@common.unknownError:erro desconhecido`;
      this.snackBar.open(
        $localize`:@@landing.createRoomFailed:Não foi possível criar a sala: ${message}:error:`,
        undefined,
        { duration: 4000 },
      );
    }
  }

  goToMobile(): void {
    void this.router.navigate(['/mobile']);
  }
}
