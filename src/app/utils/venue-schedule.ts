import { VenueSchedule } from '../types';
import { ensureTemporal } from './calendar';

export interface NextVenueOccurrence {
  readonly startIso: string;
  readonly endIso: string;
  readonly dayOfWeek: number;
  readonly startTime: string;
  readonly label: string | null;
  readonly isOngoing: boolean;
}

const WEEKDAY_SHORT_LABELS: Readonly<Record<number, string>> = {
  0: 'Dom',
  1: 'Seg',
  2: 'Ter',
  3: 'Qua',
  4: 'Qui',
  5: 'Sex',
  6: 'Sáb',
};

const WEEKDAY_FULL_LABELS: Readonly<Record<number, string>> = {
  0: 'Domingo',
  1: 'Segunda-feira',
  2: 'Terça-feira',
  3: 'Quarta-feira',
  4: 'Quinta-feira',
  5: 'Sexta-feira',
  6: 'Sábado',
};

export function getWeekdayShortLabel(dayOfWeek: number): string {
  return WEEKDAY_SHORT_LABELS[dayOfWeek] ?? '';
}

export function getWeekdayFullLabel(dayOfWeek: number): string {
  return WEEKDAY_FULL_LABELS[dayOfWeek] ?? '';
}

/**
 * Gera um slug URL-friendly a partir do nome do estabelecimento com sufixo curto aleatório.
 */
export function slugifyVenueName(name: string): string {
  const base = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);

  const suffix = Math.random().toString(36).slice(2, 6);
  return `${base || 'local'}-${suffix}`;
}

/**
 * Formata um resumo compacto dos horários semanais, ex.: "Qui · 20:00 · Sáb · 21:00".
 */
export function formatWeeklyScheduleSummary(
  schedules: ReadonlyArray<Pick<VenueSchedule, 'day_of_week' | 'start_time'>>,
): string {
  if (schedules.length === 0) return '';
  const sorted = [...schedules].sort((a, b) =>
    a.day_of_week !== b.day_of_week
      ? a.day_of_week - b.day_of_week
      : a.start_time.localeCompare(b.start_time),
  );
  return sorted
    .map((s) => `${getWeekdayShortLabel(s.day_of_week)} · ${s.start_time}`)
    .join('  |  ');
}

/**
 * Calcula a próxima ocorrência (ou a que está em andamento agora) para uma lista de horários semanais.
 */
export async function getNextVenueOccurrence(
  schedules: ReadonlyArray<Pick<VenueSchedule, 'day_of_week' | 'start_time' | 'duration_minutes' | 'label'>>,
  timezone: string,
  nowMs = Date.now(),
): Promise<NextVenueOccurrence | null> {
  if (schedules.length === 0) return null;
  const T = await ensureTemporal();
  if (!T) return null;

  const nowInstant = T.Instant.fromEpochMilliseconds(nowMs);
  const nowZoned = nowInstant.toZonedDateTimeISO(timezone);
  // Temporal: 1=Monday..7=Sunday; DB: 0=Sunday..6=Saturday
  const currentDbDow = nowZoned.dayOfWeek % 7;

  let best: {
    startMs: number;
    endMs: number;
    dayOfWeek: number;
    startTime: string;
    label: string | null;
    isOngoing: boolean;
  } | null = null;

  for (const schedule of schedules) {
    const [hourStr, minuteStr] = schedule.start_time.split(':');
    const hour = Number(hourStr);
    const minute = Number(minuteStr);
    if (!Number.isFinite(hour) || !Number.isFinite(minute)) continue;

    // Checa hoje (delta 0) e próximos 7 dias (delta 1..7), além de ontem (-1) caso tenha virado a madrugada
    const rawDelta = (schedule.day_of_week - currentDbDow + 7) % 7;
    const candidateDeltas = rawDelta === 0 ? [-1, 0, 7] : [rawDelta - 7, rawDelta];

    for (const delta of candidateDeltas) {
      const targetDate = nowZoned.toPlainDate().add({ days: delta });
      const startZoned = targetDate.toZonedDateTime({
        timeZone: timezone,
        plainTime: T.PlainTime.from({ hour, minute }),
      });
      const startMs = startZoned.epochMilliseconds;
      const endMs = startMs + schedule.duration_minutes * 60_000;

      if (endMs <= nowMs) continue;

      const isOngoing = startMs <= nowMs && nowMs < endMs;
      if (!best || startMs < best.startMs) {
        best = {
          startMs,
          endMs,
          dayOfWeek: schedule.day_of_week,
          startTime: schedule.start_time,
          label: schedule.label,
          isOngoing,
        };
      }
    }
  }

  if (!best) return null;
  return {
    startIso: new Date(best.startMs).toISOString(),
    endIso: new Date(best.endMs).toISOString(),
    dayOfWeek: best.dayOfWeek,
    startTime: best.startTime,
    label: best.label,
    isOngoing: best.isOngoing,
  };
}
