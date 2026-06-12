import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-not-found',
  imports: [RouterLink, MatButtonModule, MatIconModule],
  template: `
    <main class="nf">
      <mat-icon class="mic" aria-hidden="true">mic_off</mat-icon>
      <h1>404</h1>
      <p i18n="@@notFound.message">Essa página não existe — talvez a sala tenha acabado.</p>
      <a matButton="filled" routerLink="/">
        <mat-icon>home</mat-icon>
        <span i18n="@@notFound.goHome">Voltar pro início</span>
      </a>
    </main>
  `,
  styles: `
.nf
  min-height: 100dvh
  display: flex
  flex-direction: column
  align-items: center
  justify-content: center
  gap: 12px
  padding: 24px
  text-align: center

.mic
  font-size: 64px
  width: 64px
  height: 64px
  color: var(--mat-sys-on-surface-variant)

h1
  margin: 0
  font-size: 56px
  font-weight: 700
  color: var(--mat-sys-primary)

p
  margin: 0 0 12px
  color: var(--mat-sys-on-surface-variant)
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotFoundComponent {}
