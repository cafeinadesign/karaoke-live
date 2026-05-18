import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { VersionFooterComponent } from '../../version-footer/version-footer.component';

@Component({
  selector: 'app-privacy',
  imports: [RouterLink, MatButtonModule, MatIconModule, VersionFooterComponent],
  templateUrl: './privacy.component.html',
  styleUrl: './privacy.component.sass',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PrivacyComponent {
  protected readonly updatedAt = '2026-05-18';
  protected readonly contactEmail = 'grupocafeinadesign@gmail.com';
}
