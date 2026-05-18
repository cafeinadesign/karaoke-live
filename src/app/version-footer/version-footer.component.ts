import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { APP_COMMIT, APP_COMMIT_URL, APP_VERSION } from '../../version.generated';

@Component({
  selector: 'app-version-footer',
  imports: [RouterLink],
  template: `
    <footer class="vf">
      <a routerLink="/privacy" i18n="@@common.privacyPolicy">Política de privacidade</a>
      <span aria-hidden="true">·</span>
      <a [href]="commitUrl" target="_blank" rel="noopener" title="Commit no GitHub">
        v{{ version }}
        <span class="commit">{{ commit }}</span>
      </a>
    </footer>
  `,
  styles: `
:host
  display: block

.vf
  margin: 0 auto
  padding: 24px 16px
  font-size: 12px
  color: var(--mat-sys-on-surface-variant)
  display: flex
  justify-content: center
  align-items: center
  gap: 8px
  flex-wrap: wrap

  a
    color: inherit
    text-decoration: none

    &:hover
      text-decoration: underline

  .commit
    font-family: 'Roboto Mono', monospace
    opacity: 0.7
    margin-left: 4px
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VersionFooterComponent {
  protected readonly version = APP_VERSION;
  protected readonly commit = APP_COMMIT;
  protected readonly commitUrl = APP_COMMIT_URL;
}
