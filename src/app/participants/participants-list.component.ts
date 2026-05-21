import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { Participant } from '../types';

@Component({
  selector: 'app-participants-list',
  template: `
    <section class="participants">
      <h2>
        <span i18n="@@participants.title">Participantes</span>
        <span class="count">({{ participants().length }})</span>
      </h2>
      <ul>
        @for (p of participants(); track p.userId) {
          <li>
            @if (p.avatarUrl) {
              <img
                class="avatar"
                [src]="p.avatarUrl"
                alt=""
                referrerpolicy="no-referrer"
                width="32"
                height="32"
              />
            } @else {
              <span class="avatar fallback" aria-hidden="true">{{ initial(p.displayName) }}</span>
            }
            <span class="name">{{ p.displayName }}</span>
            @if (p.isHost) {
              <span class="host-badge" i18n="@@participants.host">anfitrião</span>
            }
          </li>
        } @empty {
          <li class="empty" i18n="@@participants.empty">Ninguém na sala ainda.</li>
        }
      </ul>
    </section>
  `,
  styles: `
:host
  display: block

.participants
  h2
    margin: 0 0 8px
    font-size: 18px
    display: flex
    align-items: baseline
    gap: 6px
    color: var(--mat-sys-on-surface)

    .count
      color: var(--mat-sys-on-surface-variant)
      font-weight: 400
      font-size: 14px

ul
  list-style: none
  margin: 0
  padding: 0
  background: var(--mat-sys-surface-container)
  border-radius: 12px
  overflow: hidden

li
  display: flex
  align-items: center
  gap: 12px
  padding: 10px 14px

  & + li
    border-top: 1px solid var(--mat-sys-outline-variant)

.avatar
  width: 32px
  height: 32px
  border-radius: 50%
  object-fit: cover
  flex-shrink: 0

.fallback
  display: flex
  align-items: center
  justify-content: center
  background: var(--mat-sys-surface-container-highest)
  color: var(--mat-sys-on-surface)
  font-size: 14px
  font-weight: 600

.name
  flex: 1
  overflow: hidden
  text-overflow: ellipsis
  white-space: nowrap

.host-badge
  font-size: 11px
  text-transform: uppercase
  letter-spacing: 0.5px
  color: var(--mat-sys-primary)
  border: 1px solid var(--mat-sys-primary)
  border-radius: 10px
  padding: 2px 8px

.empty
  color: var(--mat-sys-on-surface-variant)
  justify-content: center
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ParticipantsListComponent {
  readonly participants = input.required<ReadonlyArray<Participant>>();

  protected initial(name: string): string {
    return (name.trim()[0] ?? '?').toUpperCase();
  }
}
