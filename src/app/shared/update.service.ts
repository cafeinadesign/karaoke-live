import { Injectable, inject } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { SwUpdate } from '@angular/service-worker';
import { filter } from 'rxjs';

/**
 * Avisa quando o service worker baixou uma versão nova e oferece o reload.
 * Sem reload automático — host no meio de uma música não pode ser
 * interrompido; quem decide é o usuário.
 */
@Injectable({ providedIn: 'root' })
export class UpdateService {
  // Opcional: não existe em SSR nem em TestBed sem provideServiceWorker.
  private readonly swUpdate = inject(SwUpdate, { optional: true });
  private readonly snackBar = inject(MatSnackBar);

  init(): void {
    if (!this.swUpdate?.isEnabled) return;

    this.swUpdate!.versionUpdates
      .pipe(filter((e) => e.type === 'VERSION_READY'))
      .subscribe(() => {
        const ref = this.snackBar.open(
          $localize`:@@update.available:Nova versão disponível.`,
          $localize`:@@update.reload:Atualizar`,
          { duration: 15000 },
        );
        ref.onAction().subscribe(() => document.location.reload());
      });
  }
}
