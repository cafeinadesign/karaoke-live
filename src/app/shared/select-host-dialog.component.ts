import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatRadioModule } from '@angular/material/radio';
import { Participant } from '../types';

export interface SelectHostDialogData {
  readonly candidates: ReadonlyArray<Participant>;
  /** 'leave' (padrão): host sai depois. 'transfer': host vira convidado e fica. */
  readonly mode?: 'leave' | 'transfer';
}

@Component({
  selector: 'app-select-host-dialog',
  imports: [MatButtonModule, MatDialogModule, MatRadioModule],
  template: `
    <h2 mat-dialog-title>
      @if (data.mode === 'transfer') {
        <span i18n="@@selectHost.transferTitle">Passar o comando</span>
      } @else {
        <span i18n="@@selectHost.title">Escolha o novo anfitrião</span>
      }
    </h2>
    <mat-dialog-content>
      <p class="hint">
        @if (data.mode === 'transfer') {
          <span i18n="@@selectHost.transferHint"
            >Quem você quer que assuma a sala? Você continua como convidado.</span
          >
        } @else {
          <span i18n="@@selectHost.hint"
            >Para sair, passe o comando da sala para outra pessoa.</span
          >
        }
      </p>
      <mat-radio-group [value]="selected()" (change)="selected.set($event.value)">
        @for (p of data.candidates; track p.userId) {
          <mat-radio-button [value]="p.userId">{{ p.displayName }}</mat-radio-button>
        }
      </mat-radio-group>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button matButton type="button" [mat-dialog-close]="null" i18n="@@common.cancel">
        Cancelar
      </button>
      <button
        matButton="filled"
        type="button"
        [disabled]="!selected()"
        [mat-dialog-close]="selected()"
      >
        @if (data.mode === 'transfer') {
          <span i18n="@@selectHost.transferConfirm">Passar o comando</span>
        } @else {
          <span i18n="@@selectHost.confirm">Passar e sair</span>
        }
      </button>
    </mat-dialog-actions>
  `,
  styles: `
.hint
  margin: 0 0 12px
  color: var(--mat-sys-on-surface-variant)
  font-size: 14px

mat-radio-group
  display: flex
  flex-direction: column
  gap: 4px
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SelectHostDialogComponent {
  protected readonly data = inject<SelectHostDialogData>(MAT_DIALOG_DATA);
  protected readonly selected = signal<string | null>(null);
}
