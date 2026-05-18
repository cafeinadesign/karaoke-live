import { ChangeDetectionStrategy, Component, effect, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { AuthService } from '../../auth/auth.service';

@Component({
  selector: 'app-login',
  imports: [MatButtonModule, MatIconModule],
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
        void this.router.navigateByUrl(target);
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
