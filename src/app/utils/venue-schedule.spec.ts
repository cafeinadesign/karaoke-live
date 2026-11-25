import { beforeAll, describe, expect, it } from 'vitest';
import { ensureTemporal } from './calendar';
import {
  formatWeeklyScheduleSummary,
  getNextVenueOccurrence,
  slugifyVenueName,
} from './venue-schedule';

describe('venue-schedule', () => {
  beforeAll(async () => {
    await ensureTemporal();
  });

  it('slugifies venue names with a short random suffix', () => {
    const slug = slugifyVenueName('Bar do Zé & Karaokê!');
    expect(slug).toMatch(/^bar-do-ze-karaoke-[a-z0-9]{4}$/);
  });

  it('formats weekly schedule summary sorted by day and time', () => {
    const summary = formatWeeklyScheduleSummary([
      { day_of_week: 6, start_time: '21:00' },
      { day_of_week: 4, start_time: '20:00' },
    ]);
    expect(summary).toBe('Qui · 20:00  |  Sáb · 21:00');
  });

  it('computes the next upcoming occurrence', async () => {
    // 2026-11-25 is a Wednesday (day_of_week = 3), 14:00 BRT (-03:00)
    const nowMs = Date.parse('2026-11-25T14:00:00-03:00');
    const next = await getNextVenueOccurrence(
      [
        { day_of_week: 4, start_time: '20:00', duration_minutes: 240, label: 'Quinta Karaokê' },
        { day_of_week: 6, start_time: '21:00', duration_minutes: 240, label: null },
      ],
      'America/Sao_Paulo',
      nowMs,
    );

    expect(next).not.toBeNull();
    expect(next?.dayOfWeek).toBe(4);
    expect(next?.isOngoing).toBe(false);
    expect(next?.label).toBe('Quinta Karaokê');
    expect(Date.parse(next!.startIso)).toBe(Date.parse('2026-11-26T20:00:00-03:00'));
  });

  it('detects an ongoing occurrence within duration', async () => {
    // 2026-11-26 is Thursday 21:30 BRT, schedule started at 20:00 for 240m
    const nowMs = Date.parse('2026-11-26T21:30:00-03:00');
    const next = await getNextVenueOccurrence(
      [{ day_of_week: 4, start_time: '20:00', duration_minutes: 240, label: null }],
      'America/Sao_Paulo',
      nowMs,
    );

    expect(next).not.toBeNull();
    expect(next?.isOngoing).toBe(true);
  });
});
