import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { formatDuration } from '../utils/format';

@Component({
  selector: 'app-playback-bar',
  imports: [MatProgressBarModule],
  template: `
    <div class="pb">
      <mat-progress-bar mode="determinate" [value]="percent()" />
      <div class="times">
        <span class="elapsed">{{ elapsedLabel() }}</span>
        <span class="duration">{{ durationLabel() }}</span>
      </div>
    </div>
  `,
  styles: `
:host
  display: block

.pb
  display: flex
  flex-direction: column
  gap: 4px

.times
  display: flex
  justify-content: space-between
  font-family: 'Roboto Mono', monospace
  font-size: 12px
  color: var(--mat-sys-on-surface-variant)

  .elapsed
    color: var(--mat-sys-primary)
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlaybackBarComponent {
  readonly elapsed = input.required<number>();
  readonly duration = input.required<number>();

  protected readonly percent = computed<number>(() => {
    const total = this.duration();
    if (total <= 0) return 0;
    return Math.min(100, Math.max(0, (this.elapsed() / total) * 100));
  });

  protected readonly elapsedLabel = computed(() => formatDuration(this.clampedElapsed()));
  protected readonly durationLabel = computed(() => formatDuration(this.duration()));

  private clampedElapsed(): number {
    const total = this.duration();
    const e = this.elapsed();
    return total > 0 ? Math.min(e, total) : e;
  }
}
