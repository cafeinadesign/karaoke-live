import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { MAT_BOTTOM_SHEET_DATA, MatBottomSheetRef } from '@angular/material/bottom-sheet';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { toDataURL } from 'qrcode';

export interface ShareSheetData {
  readonly code: string;
  readonly url: string;
}

@Component({
  selector: 'app-share-sheet',
  imports: [MatButtonModule, MatIconModule],
  template: `
    <div class="sheet">
      <h2 i18n="@@share.title">Compartilhe a sala</h2>

      <div class="qr-wrap" aria-hidden="true">
        @if (qrSrc()) {
          <img [src]="qrSrc()" alt="" width="240" height="240" />
        }
      </div>

      <div
        class="code-row"
        role="group"
        i18n-aria-label="@@share.roomCodeAriaLabel"
        aria-label="Código da sala"
      >
        @for (char of codeChars(); track $index) {
          <span class="char">{{ char }}</span>
        }
      </div>

      <p class="url">{{ data.url }}</p>

      <div class="actions">
        <button matButton="filled" type="button" (click)="copyCode()">
          <mat-icon>content_copy</mat-icon>
          <span i18n="@@share.copyCode">Copiar código</span>
        </button>
        <button matButton="tonal" type="button" (click)="copyUrl()">
          <mat-icon>link</mat-icon>
          <span i18n="@@share.copyLink">Copiar link</span>
        </button>
        @if (canNativeShare) {
          <button matButton="text" type="button" (click)="nativeShare()">
            <mat-icon>share</mat-icon>
            <span i18n="@@share.share">Compartilhar</span>
          </button>
        }
      </div>
    </div>
  `,
  styles: `
:host
  display: block
  background: var(--mat-sys-surface-container)
  color: var(--mat-sys-on-surface)

.sheet
  padding: 24px 24px 32px
  display: flex
  flex-direction: column
  align-items: center
  gap: 16px
  text-align: center

h2
  margin: 0
  font-size: 22px
  font-weight: 600

.qr-wrap
  background: #ffffff
  padding: 12px
  border-radius: 12px
  line-height: 0

  img
    display: block
    width: 240px
    height: 240px

.code-row
  display: flex
  gap: 8px
  font-family: 'Roboto Mono', monospace
  font-weight: 700
  font-size: 28px
  letter-spacing: 4px
  color: var(--mat-sys-primary)

  .char
    background: var(--mat-sys-surface-container-high)
    padding: 6px 10px
    border-radius: 8px
    min-width: 32px

.url
  margin: 0
  color: var(--mat-sys-on-surface-variant)
  font-size: 13px
  word-break: break-all

.actions
  display: flex
  flex-wrap: wrap
  justify-content: center
  gap: 8px
  margin-top: 8px
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ShareSheetComponent {
  protected readonly data = inject<ShareSheetData>(MAT_BOTTOM_SHEET_DATA);
  private readonly ref = inject(MatBottomSheetRef);
  private readonly snackBar = inject(MatSnackBar);

  protected readonly qrSrc = signal<string | null>(null);
  protected readonly codeChars = computed(() => this.data.code.split(''));
  protected readonly canNativeShare = typeof navigator !== 'undefined' && 'share' in navigator;

  constructor() {
    void this.renderQr();
  }

  protected async copyCode(): Promise<void> {
    await this.copyText(this.data.code, $localize`:@@share.codeCopied:Código copiado.`);
  }

  protected async copyUrl(): Promise<void> {
    await this.copyText(this.data.url, $localize`:@@share.linkCopied:Link copiado.`);
  }

  protected async nativeShare(): Promise<void> {
    try {
      await navigator.share({
        title: 'Karaokê Live',
        text: $localize`:@@share.shareText:Entra na sala ${this.data.code}:code:`,
        url: this.data.url,
      });
      this.ref.dismiss();
    } catch {
      // user cancelled or unsupported
    }
  }

  private async copyText(text: string, message: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      this.snackBar.open(message, undefined, { duration: 1500 });
    } catch {
      this.snackBar.open(text, undefined, { duration: 3000 });
    }
  }

  private async renderQr(): Promise<void> {
    const dataUrl = await toDataURL(this.data.url, {
      margin: 1,
      width: 480,
      color: { dark: '#0f0f0f', light: '#ffffff' },
      errorCorrectionLevel: 'M',
    });
    this.qrSrc.set(dataUrl);
  }
}
