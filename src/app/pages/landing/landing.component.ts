import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AuthService } from '../../auth/auth.service';
import { RoomMembership, RoomSummary, RoomsService } from '../../rooms/rooms.service';
import { isRoomScheduled } from '../../types';
import {
  CreateRoomDialogComponent,
  CreateRoomDialogResult,
} from '../../shared/create-room-dialog.component';
import { formatEventDateTime } from '../../utils/calendar';
import { GeoPoint, distanceKm, formatDistanceKm } from '../../utils/geo';
import { VersionFooterComponent } from '../../version-footer/version-footer.component';

export interface PublicEventView {
  readonly room: RoomSummary;
  readonly distanceLabel: string | null;
  readonly distanceKm: number | null;
}

@Component({
  selector: 'app-landing',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    RouterLink,
    VersionFooterComponent,
  ],
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
  private readonly destroyRef = inject(DestroyRef);

  protected readonly memberships = signal<RoomMembership[] | null>(null);
  protected readonly membershipsFailed = signal(false);
  protected readonly publicEvents = signal<RoomSummary[] | null>(null);
  protected readonly publicEventsFailed = signal(false);
  protected readonly userLocation = signal<GeoPoint | null>(null);
  protected readonly nearMeLoading = signal(false);
  protected readonly locationStatus = signal('');

  protected readonly searchControl = new FormControl('', { nonNullable: true });
  private readonly searchValue = toSignal(this.searchControl.valueChanges, {
    initialValue: '',
  });

  private readonly refresh = signal(0);

  protected readonly visiblePublicEvents = computed<ReadonlyArray<PublicEventView>>(() => {
    const list = this.publicEvents();
    if (!list) return [];
    const term = this.searchValue().trim().toLowerCase();
    const loc = this.userLocation();

    const filtered = term
      ? list.filter(
          (room) =>
            room.name.toLowerCase().includes(term) ||
            (room.venue_name?.toLowerCase().includes(term) ?? false),
        )
      : list;

    const mapped = filtered.map((room): PublicEventView => {
      if (loc && room.latitude !== null && room.longitude !== null) {
        const km = distanceKm(loc, { latitude: room.latitude, longitude: room.longitude });
        return { room, distanceKm: km, distanceLabel: formatDistanceKm(km) };
      }
      return { room, distanceKm: null, distanceLabel: null };
    });

    if (loc) {
      return [...mapped].sort((a, b) => {
        if (a.distanceKm !== null && b.distanceKm !== null) {
          return a.distanceKm - b.distanceKm;
        }
        if (a.distanceKm !== null) return -1;
        if (b.distanceKm !== null) return 1;
        return 0;
      });
    }

    return mapped;
  });

  constructor() {
    effect((onCleanup) => {
      const userId = this.auth.user()?.id;
      this.refresh();
      this.memberships.set(null);
      this.membershipsFailed.set(false);
      this.publicEvents.set(null);
      this.publicEventsFailed.set(false);
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

      if (typeof this.rooms.listPublicRooms === 'function') {
        void this.rooms.listPublicRooms().then(
          (events) => {
            if (current) this.publicEvents.set(events);
          },
          () => {
            if (current) this.publicEventsFailed.set(true);
          },
        );
      } else {
        this.publicEvents.set([]);
      }
    });
  }

  protected retryMemberships(): void {
    this.refresh.update((version) => version + 1);
  }

  protected isScheduled(room: Pick<RoomSummary, 'ended_at' | 'started_at'>): boolean {
    return isRoomScheduled(room);
  }

  protected formatSchedule(room: Pick<RoomSummary, 'scheduled_at' | 'event_timezone'>): string {
    if (!room.scheduled_at) return '';
    return formatEventDateTime(room.scheduled_at, room.event_timezone);
  }

  protected openDashboardAria(name: string): string {
    return $localize`:@@rooms.openDashboardAria:Abrir painel: ${name}:name:`;
  }

  protected returnRoomAria(name: string): string {
    return $localize`:@@rooms.returnAria:Voltar à sala: ${name}:name:`;
  }

  protected enterEventAria(name: string): string {
    return $localize`:@@events.enterAria:Entrar: ${name}:name:`;
  }

  protected toggleNearMe(): void {
    if (this.userLocation()) {
      this.userLocation.set(null);
      this.locationStatus.set('');
      return;
    }
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      this.locationStatus.set(
        $localize`:@@createRoom.geoUnsupported:Geolocalização não está disponível neste dispositivo.`,
      );
      return;
    }
    this.nearMeLoading.set(true);
    this.locationStatus.set($localize`:@@createRoom.geoLoading:Obtendo sua localização…`);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (this.destroyRef.destroyed) return;
        this.nearMeLoading.set(false);
        this.userLocation.set({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        });
        this.locationStatus.set($localize`:@@landing.sortedByDistance:Ordenado por proximidade.`);
      },
      () => {
        if (this.destroyRef.destroyed) return;
        this.nearMeLoading.set(false);
        this.locationStatus.set(
          $localize`:@@landing.geoFailed:Não foi possível obter sua localização agora.`,
        );
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 },
    );
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
      restoreFocus: true,
    });
    const result = (await ref.afterClosed().toPromise()) ?? null;
    if (!result) return;

    try {
      const room = await this.rooms.createRoom(result);
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
