import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AuthService } from '../../auth/auth.service';
import { EventCalendarActionsComponent } from '../../shared/event-calendar-actions.component';
import { formatEventDateTime } from '../../utils/calendar';
import {
  NextVenueOccurrence,
  getNextVenueOccurrence,
  getWeekdayFullLabel,
} from '../../utils/venue-schedule';
import {
  VenueFormDialogComponent,
  VenueFormDialogResult,
} from '../../venues/venue-form-dialog.component';
import { VenueWithDetails, VenuesService } from '../../venues/venues.service';

@Component({
  selector: 'app-venue-detail',
  imports: [
    MatButtonModule,
    MatIconModule,
    RouterLink,
    EventCalendarActionsComponent,
  ],
  template: `
    <main class="venue-page">
      <nav class="top-nav">
        <a matButton="text" routerLink="/">
          <mat-icon>arrow_back</mat-icon>
          <span i18n="@@venueDetail.backHome">Início</span>
        </a>
      </nav>

      @if (loading()) {
        <p role="status" i18n="@@venueDetail.loading">Carregando estabelecimento…</p>
      } @else if (notFound()) {
        <section class="empty-state">
          <h1 i18n="@@venueDetail.notFoundTitle">Estabelecimento não encontrado</h1>
          <p i18n="@@venueDetail.notFoundHint">
            Verifique o link ou volte para a página inicial.
          </p>
        </section>
      } @else if (venue(); as v) {
        <header class="venue-header">
          <div class="title-row">
            <h1>{{ v.name }}</h1>
            @if (v.activeRoom) {
              <span class="badge live" i18n="@@venueDetail.queueOpenBadge">Fila aberta</span>
            }
          </div>

          @if (v.description) {
            <p class="description">{{ v.description }}</p>
          }

          @if (v.address) {
            <p class="meta-line">
              <mat-icon aria-hidden="true">place</mat-icon>
              <span>{{ v.address }}</span>
            </p>
          }

          @if (v.instagram_handle) {
            <p class="meta-line">
              <mat-icon aria-hidden="true">alternate_email</mat-icon>
              <a
                [href]="'https://instagram.com/' + v.instagram_handle"
                target="_blank"
                rel="noopener noreferrer"
              >
                &#64;{{ v.instagram_handle }}
              </a>
            </p>
          }
        </header>

        <section class="session-card" aria-labelledby="session-title">
          <h2 id="session-title" i18n="@@venueDetail.sessionTitle">Karaokê</h2>

          @if (v.activeRoom; as room) {
            <p class="session-status" i18n="@@venueDetail.activeSessionText">
              A fila de hoje já está aberta! Código: <strong>{{ room.code }}</strong>
            </p>
            <div class="session-actions">
              @if (isOwner()) {
                <a matButton="filled" [routerLink]="['/host-dashboard', room.id]">
                  <mat-icon>dashboard</mat-icon>
                  <span i18n="@@rooms.openDashboard">Abrir painel</span>
                </a>
              } @else {
                <a matButton="filled" [routerLink]="['/mobile', room.code]">
                  <mat-icon>mic</mat-icon>
                  <span i18n="@@venueDetail.joinQueue">Entrar na fila</span>
                </a>
              }
            </div>
          } @else {
            @if (nextOccurrence(); as next) {
              <p class="session-status">
                @if (next.isOngoing) {
                  <ng-container i18n="@@venueDetail.ongoingNotOpened">
                    Horário de karaokê em andamento — aguardando o host abrir a fila.
                  </ng-container>
                } @else {
                  <ng-container i18n="@@venueDetail.nextOccurrence">
                    Próximo karaokê: <strong>{{ formatOccurrence(next, v.timezone) }}</strong>
                  </ng-container>
                }
              </p>

              <app-event-calendar-actions
                [room]="{
                  id: v.id,
                  code: v.slug,
                  name: v.name,
                  scheduled_at: next.startIso,
                  scheduled_end_at: next.endIso,
                  event_timezone: v.timezone,
                  venue_name: v.address || v.name,
                  latitude: v.latitude,
                  longitude: v.longitude
                }"
              />
            } @else {
              <p class="session-status" i18n="@@venueDetail.noActiveQueue">
                Nenhuma fila aberta no momento.
              </p>
            }

            @if (isOwner()) {
              <div class="owner-actions">
                <button
                  matButton="filled"
                  type="button"
                  (click)="openSessionNow()"
                  [disabled]="actionBusy()"
                >
                  <mat-icon>play_circle</mat-icon>
                  <span i18n="@@venueDetail.openQueueNow">Abrir fila agora</span>
                </button>
                <button
                  matButton="outlined"
                  type="button"
                  (click)="editVenue()"
                  [disabled]="actionBusy()"
                >
                  <mat-icon>edit</mat-icon>
                  <span i18n="@@venueDetail.editVenue">Editar estabelecimento</span>
                </button>
              </div>
            }
          }
        </section>

        @if (v.schedules.length > 0) {
          <section class="schedules-card" aria-labelledby="schedules-title">
            <h2 id="schedules-title" i18n="@@venueDetail.schedulesTitle">Horários semanais</h2>
            <ul role="list" class="schedule-list">
              @for (s of v.schedules; track s.id) {
                <li>
                  <strong>{{ weekdayLabel(s.day_of_week) }}</strong>
                  <span>{{ s.start_time }}</span>
                </li>
              }
            </ul>
          </section>
        }
      }
    </main>
  `,
  styles: `
.venue-page
  max-width: 680px
  margin: 0 auto
  padding: 16px 20px 48px
  display: flex
  flex-direction: column
  gap: 20px

.top-nav
  display: flex
  align-items: center

.venue-header
  display: flex
  flex-direction: column
  gap: 8px

.title-row
  display: flex
  align-items: center
  gap: 12px
  flex-wrap: wrap

  h1
    margin: 0
    font-size: 1.75rem

.badge.live
  background: var(--mat-sys-primary-container)
  color: var(--mat-sys-on-primary-container)
  padding: 4px 10px
  border-radius: 999px
  font-size: 0.75rem
  font-weight: 600

.description
  margin: 0
  color: var(--mat-sys-on-surface-variant)

.meta-line
  display: flex
  align-items: center
  gap: 8px
  margin: 0
  font-size: 0.95rem

  mat-icon
    font-size: 18px
    width: 18px
    height: 18px

.session-card,
.schedules-card
  border: 1px solid var(--mat-sys-outline-variant)
  border-radius: 16px
  padding: 16px 20px
  display: flex
  flex-direction: column
  gap: 12px

  h2
    margin: 0
    font-size: 1.1rem

.session-status
  margin: 0

.session-actions,
.owner-actions
  display: flex
  gap: 10px
  flex-wrap: wrap

.schedule-list
  list-style: none
  padding: 0
  margin: 0
  display: flex
  flex-direction: column
  gap: 8px

  li
    display: flex
    justify-content: space-between
    padding: 6px 0
    border-bottom: 1px solid var(--mat-sys-outline-variant)

    &:last-child
      border-bottom: none
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VenueDetailComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly venuesService = inject(VenuesService);
  private readonly auth = inject(AuthService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);

  private readonly slug = toSignal(this.route.paramMap.pipe(map((p) => p.get('slug') ?? '')), {
    initialValue: '',
  });

  protected readonly venue = signal<VenueWithDetails | null>(null);
  protected readonly loading = signal(true);
  protected readonly notFound = signal(false);
  protected readonly nextOccurrence = signal<NextVenueOccurrence | null>(null);
  protected readonly actionBusy = signal(false);
  private readonly refreshTrigger = signal(0);

  protected readonly isOwner = computed(() => {
    const v = this.venue();
    const uid = this.auth.user()?.id;
    return Boolean(v && uid && v.owner_id === uid);
  });

  constructor() {
    effect((onCleanup) => {
      const slug = this.slug();
      this.refreshTrigger();
      if (!slug) return;

      let active = true;
      onCleanup(() => {
        active = false;
      });

      this.loading.set(true);
      this.notFound.set(false);
      void this.venuesService.getVenueBySlug(slug).then(
        async (v) => {
          if (!active) return;
          this.venue.set(v);
          this.notFound.set(!v);
          this.loading.set(false);
          if (v && v.schedules.length > 0) {
            const next = await getNextVenueOccurrence(v.schedules, v.timezone);
            if (active) this.nextOccurrence.set(next);
          } else {
            this.nextOccurrence.set(null);
          }
        },
        () => {
          if (!active) return;
          this.loading.set(false);
          this.notFound.set(true);
        },
      );
    });
  }

  protected weekdayLabel(day: number): string {
    return getWeekdayFullLabel(day);
  }

  protected formatOccurrence(next: NextVenueOccurrence, timezone: string): string {
    return formatEventDateTime(next.startIso, timezone);
  }

  protected async openSessionNow(): Promise<void> {
    const v = this.venue();
    if (!v || this.actionBusy()) return;
    this.actionBusy.set(true);
    try {
      const room = await this.venuesService.openVenueSession(v.id, {
        isPublic: v.is_public,
      });
      await this.router.navigate(['/host-dashboard', room.id]);
    } catch {
      this.snackBar.open(
        $localize`:@@venueDetail.openFailed:Não foi possível abrir a fila agora.`,
        undefined,
        { duration: 4000 },
      );
    } finally {
      this.actionBusy.set(false);
    }
  }

  protected editVenue(): void {
    const v = this.venue();
    if (!v) return;
    const ref = this.dialog.open<VenueFormDialogComponent, { venue: VenueWithDetails }, VenueFormDialogResult>(
      VenueFormDialogComponent,
      { data: { venue: v }, width: '520px', maxWidth: '95vw' },
    );

    ref.afterClosed().subscribe(async (result) => {
      if (!result) return;
      this.actionBusy.set(true);
      try {
        await this.venuesService.updateVenue(v.id, result.venue, result.schedules);
        this.refreshTrigger.update((n) => n + 1);
      } catch {
        this.snackBar.open(
          $localize`:@@venueDetail.updateFailed:Não foi possível atualizar o estabelecimento.`,
          undefined,
          { duration: 4000 },
        );
      } finally {
        this.actionBusy.set(false);
      }
    });
  }
}
