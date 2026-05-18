import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatBottomSheetRef, MAT_BOTTOM_SHEET_DATA } from '@angular/material/bottom-sheet';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { QueueItem } from '../../types';

export interface YourTurnData {
  readonly item: QueueItem;
}

@Component({
  selector: 'app-your-turn-sheet',
  imports: [MatButtonModule, MatIconModule],
  template: `
    <div class="sheet">
      <mat-icon class="mic" aria-hidden="true">mic</mat-icon>
      <h2 i18n="@@yourTurn.title">É a sua vez!</h2>
      <p class="song">{{ data.item.video_title }}</p>
      @if (data.item.gemini_message) {
        <p class="roast">{{ data.item.gemini_message }}</p>
      } @else {
        <p class="roast loading" i18n="@@yourTurn.loading">Preparando uma palavra de incentivo...</p>
      }
      <button matButton="filled" type="button" (click)="dismiss()" i18n="@@yourTurn.ready">
        Estou pronto
      </button>
    </div>
  `,
  styles: `
:host
  display: block
  background: var(--app-accent-gold)
  color: var(--app-accent-gold-on)

.sheet
  padding: 32px 24px 40px
  display: flex
  flex-direction: column
  align-items: center
  gap: 12px
  text-align: center

.mic
  font-size: 56px
  width: 56px
  height: 56px

h2
  margin: 0
  font-size: 28px
  font-weight: 700

.song
  margin: 0
  font-size: 18px
  font-weight: 500

.roast
  margin: 8px 0 16px
  font-size: 16px
  line-height: 1.4
  max-width: 360px
  font-style: italic

.loading
  opacity: 0.6

button
  min-width: 200px
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class YourTurnSheetComponent {
  protected readonly data = inject<YourTurnData>(MAT_BOTTOM_SHEET_DATA);
  private readonly ref = inject(MatBottomSheetRef);

  dismiss(): void {
    this.ref.dismiss();
  }
}
