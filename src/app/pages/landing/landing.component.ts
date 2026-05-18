import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { AuthService } from '../../auth/auth.service';
import { RoomsService } from '../../rooms/rooms.service';
import { VersionFooterComponent } from '../../version-footer/version-footer.component';

@Component({
  selector: 'app-landing',
  imports: [MatButtonModule, MatIconModule, VersionFooterComponent],
  templateUrl: './landing.component.html',
  styleUrl: './landing.component.sass',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LandingComponent {
  protected readonly auth = inject(AuthService);
  private readonly rooms = inject(RoomsService);
  private readonly router = inject(Router);

  async signIn(): Promise<void> {
    await this.auth.signInWithGoogle();
  }

  async signOut(): Promise<void> {
    await this.auth.signOut();
  }

  async hostNewRoom(): Promise<void> {
    const room = await this.rooms.createRoom(null);
    await this.router.navigate(['/host-dashboard', room.id]);
  }

  goToMobile(): void {
    void this.router.navigate(['/mobile']);
  }
}
