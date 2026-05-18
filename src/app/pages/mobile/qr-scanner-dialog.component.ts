import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import QrScanner from 'qr-scanner';

@Component({
  selector: 'app-qr-scanner-dialog',
  imports: [MatButtonModule, MatIconModule],
  template: `
    <div class="dialog">
      <button matIconButton type="button" (click)="cancel()" aria-label="Fechar" class="close">
        <mat-icon>close</mat-icon>
      </button>

      <div class="video-wrap">
        <video #video playsinline muted></video>
        <div class="reticle" aria-hidden="true"></div>
      </div>

      <p class="hint">
        @if (error()) {
          {{ error() }}
        } @else {
          Aponte a câmera para o QR da sala.
        }
      </p>
    </div>
  `,
  styles: `
:host
  display: block
  background: #000000
  color: #ffffff

.dialog
  position: relative
  display: flex
  flex-direction: column
  align-items: center
  gap: 12px
  padding: 24px 16px
  min-height: 360px

.close
  position: absolute
  top: 8px
  right: 8px
  color: #ffffff
  z-index: 2

.video-wrap
  position: relative
  width: 100%
  max-width: 360px
  aspect-ratio: 1
  background: #111111
  border-radius: 16px
  overflow: hidden

  video
    width: 100%
    height: 100%
    object-fit: cover

.reticle
  position: absolute
  inset: 16%
  border: 2px solid rgba(255, 255, 255, 0.85)
  border-radius: 12px
  pointer-events: none

.hint
  margin: 0
  font-size: 14px
  color: rgba(255, 255, 255, 0.8)
  text-align: center
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class QrScannerDialogComponent implements AfterViewInit, OnDestroy {
  private readonly ref = inject<MatDialogRef<QrScannerDialogComponent, string | null>>(MatDialogRef);
  private readonly videoRef = viewChild.required<ElementRef<HTMLVideoElement>>('video');
  protected readonly error = signal<string | null>(null);
  private scanner: QrScanner | null = null;

  async ngAfterViewInit(): Promise<void> {
    const videoEl = this.videoRef().nativeElement;
    try {
      this.scanner = new QrScanner(videoEl, (result) => this.onScan(result.data), {
        highlightScanRegion: false,
        highlightCodeOutline: false,
        preferredCamera: 'environment',
      });
      await this.scanner.start();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'erro_desconhecido';
      this.error.set(`Câmera indisponível: ${message}`);
    }
  }

  ngOnDestroy(): void {
    this.scanner?.stop();
    this.scanner?.destroy();
    this.scanner = null;
  }

  protected cancel(): void {
    this.ref.close(null);
  }

  private onScan(rawValue: string): void {
    const code = this.extractCode(rawValue);
    if (!code) {
      this.error.set('QR não reconhecido. Tente o código manual.');
      return;
    }
    this.ref.close(code);
  }

  private extractCode(value: string): string | null {
    const trimmed = value.trim();
    if (/^[A-Z0-9]{6}$/.test(trimmed.toUpperCase())) {
      return trimmed.toUpperCase();
    }
    try {
      const url = new URL(trimmed);
      const match = url.pathname.match(/\/mobile\/([A-Z0-9]{6})/i);
      if (match) return match[1].toUpperCase();
    } catch {
      return null;
    }
    return null;
  }
}
