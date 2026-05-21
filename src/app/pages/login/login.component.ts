import { ChangeDetectionStrategy, Component, effect, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { AuthService } from '../../auth/auth.service';
import { VersionFooterComponent } from '../../version-footer/version-footer.component';

@Component({
  selector: 'app-login',
  imports: [MatButtonModule, MatIconModule, VersionFooterComponent],
  templateUrl: './login.component.html',
  styleUrl: './login.component.sass',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoginComponent {
  protected readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  constructor() {
    effect(() => {
      if (this.auth.isAuthenticated()) {
        const redirect = this.route.snapshot.queryParamMap.get('redirect');
        const target = redirect ? new URL(redirect, document.baseURI).pathname : '/';
        // replaceUrl so /login never stays in history — back/gesture won't return here.
        void this.router.navigateByUrl(target, { replaceUrl: true });
      }
    });
  }

  async signIn(): Promise<void> {
    const redirect = this.route.snapshot.queryParamMap.get('redirect');
    const target = redirect
      ? new URL(redirect, document.baseURI).toString()
      : window.location.origin;
    await this.auth.signInWithGoogle(target);
  }
}
