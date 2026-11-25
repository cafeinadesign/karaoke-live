import type { Temporal as TemporalApi } from 'temporal-polyfill';
import { Room } from '../types';

export const DEFAULT_EVENT_DURATION_HOURS = 3;

export type CalendarRoom = Pick<
  Room,
  | 'id'
  | 'code'
  | 'name'
  | 'scheduled_at'
  | 'scheduled_end_at'
  | 'event_timezone'
  | 'venue_name'
  | 'latitude'
  | 'longitude'
>;

export interface ResolvedEventInterval {
  readonly startIso: string;
  readonly endIso: string;
  readonly timeZone: string;
  readonly hasDstConflict: boolean;
}

type TemporalGlobal = { Temporal?: typeof TemporalApi };

let polyfillPromise: Promise<typeof TemporalApi | undefined> | null = null;

function getTemporal(): typeof TemporalApi | undefined {
  return (globalThis as unknown as TemporalGlobal).Temporal;
}

/**
 * Loads temporal-polyfill lazily only when native Temporal is unavailable
 * (e.g. Safari), avoiding network CDNs and keeping zero overhead on Chrome/Firefox.
 */
export async function ensureTemporal(): Promise<typeof TemporalApi | undefined> {
  const existing = getTemporal();
  if (existing) return existing;
  if (!polyfillPromise) {
    polyfillPromise = import('temporal-polyfill')
      .then((mod) => {
        (globalThis as unknown as TemporalGlobal).Temporal = mod.Temporal;
        return mod.Temporal;
      })
      .catch(() => undefined);
  }
  return polyfillPromise;
}

export function getLocalTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

/**
 * Resolves a local date (YYYY-MM-DD) and wall-clock time (HH:mm) bound to an
 * IANA time zone into UTC ISO instants, handling DST transitions predictably.
 */
export function resolveEventInterval(
  dateStr: string,
  timeStr: string,
  durationHours = DEFAULT_EVENT_DURATION_HOURS,
  timeZone = getLocalTimeZone(),
): ResolvedEventInterval | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr) || !/^\d{2}:\d{2}$/.test(timeStr)) {
    return null;
  }
  const safeDuration = Number.isFinite(durationHours) && durationHours > 0
    ? durationHours
    : DEFAULT_EVENT_DURATION_HOURS;

  const T = getTemporal();
  if (T) {
    const spec = `${dateStr}T${timeStr}[${timeZone}]`;
    let hasDstConflict = false;
    try {
      T.ZonedDateTime.from(spec, { disambiguation: 'reject' });
    } catch (err) {
      if (err instanceof RangeError) {
        hasDstConflict = true;
      } else {
        return null;
      }
    }

    try {
      const start = T.ZonedDateTime.from(spec, { disambiguation: 'compatible' });
      const end = start.add({ minutes: Math.round(safeDuration * 60) });
      return {
        startIso: start.toInstant().toString(),
        endIso: end.toInstant().toString(),
        timeZone: start.timeZoneId,
        hasDstConflict,
      };
    } catch {
      return null;
    }
  }

  const parsed = new Date(`${dateStr}T${timeStr}:00`);
  if (Number.isNaN(parsed.getTime())) return null;
  const end = new Date(parsed.getTime() + safeDuration * 3_600_000);
  return {
    startIso: parsed.toISOString(),
    endIso: end.toISOString(),
    timeZone,
    hasDstConflict: false,
  };
}

export function formatEventDateTime(
  iso: string,
  timeZone?: string | null,
  locale?: string,
): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';

  const targetTimeZone = timeZone?.trim() || getLocalTimeZone();
  const T = getTemporal();
  if (T) {
    try {
      const zoned = T.Instant.from(iso).toZonedDateTimeISO(targetTimeZone);
      return zoned.toLocaleString(locale, {
        weekday: 'short',
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      // Fallback to Intl.DateTimeFormat below.
    }
  }

  try {
    return new Intl.DateTimeFormat(locale, {
      weekday: 'short',
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: targetTimeZone,
    }).format(date);
  } catch {
    return new Intl.DateTimeFormat(locale, {
      weekday: 'short',
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  }
}

function getEffectiveRange(room: CalendarRoom): { startIso: string; endIso: string } | null {
  if (!room.scheduled_at) return null;
  const startDate = new Date(room.scheduled_at);
  if (Number.isNaN(startDate.getTime())) return null;

  let endDate = room.scheduled_end_at ? new Date(room.scheduled_end_at) : null;
  if (!endDate || Number.isNaN(endDate.getTime()) || endDate.getTime() <= startDate.getTime()) {
    endDate = new Date(startDate.getTime() + DEFAULT_EVENT_DURATION_HOURS * 3_600_000);
  }
  return { startIso: startDate.toISOString(), endIso: endDate.toISOString() };
}

function toUtcCompact(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  );
}

function formatLocation(room: CalendarRoom): string {
  const venue = room.venue_name?.trim();
  if (venue) return venue;
  if (room.latitude !== null && room.longitude !== null) {
    return `${room.latitude},${room.longitude}`;
  }
  return '';
}

function buildDescription(room: CalendarRoom, roomUrl: string): string {
  const lines = [
    $localize`:@@calendar.eventSummary:Karaokê Live — Sala ${room.code}:code:`,
    roomUrl,
  ];
  return lines.join('\n');
}

export function buildGoogleCalendarUrl(room: CalendarRoom, origin: string): string | null {
  const range = getEffectiveRange(room);
  if (!range) return null;

  const cleanOrigin = origin.replace(/\/+$/, '');
  const roomUrl = `${cleanOrigin}/mobile/${room.code}`;
  const location = formatLocation(room);

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: room.name,
    dates: `${toUtcCompact(range.startIso)}/${toUtcCompact(range.endIso)}`,
    details: buildDescription(room, roomUrl),
  });
  if (location) {
    params.set('location', location);
  }
  if (room.event_timezone) {
    params.set('ctz', room.event_timezone);
  }

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function escapeIcsText(value: string): string {
  return value
    .replaceAll('\\', '\\\\')
    .replaceAll(';', '\\;')
    .replaceAll(',', '\\,')
    .replaceAll('\r\n', '\\n')
    .replaceAll('\n', '\\n')
    .replaceAll('\r', '\\n');
}

export function buildIcsContent(
  room: CalendarRoom,
  origin: string,
  now = new Date(),
): string | null {
  const range = getEffectiveRange(room);
  if (!range) return null;

  const cleanOrigin = origin.replace(/\/+$/, '');
  const roomUrl = `${cleanOrigin}/mobile/${room.code}`;
  const location = formatLocation(room);
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Karaoke Live//Eventos//PT',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${room.id}@karaoke-live.app.br`,
    `DTSTAMP:${toUtcCompact(now.toISOString())}`,
    `DTSTART:${toUtcCompact(range.startIso)}`,
    `DTEND:${toUtcCompact(range.endIso)}`,
    `SUMMARY:${escapeIcsText(room.name)}`,
    `DESCRIPTION:${escapeIcsText(buildDescription(room, roomUrl))}`,
  ];

  if (location) {
    lines.push(`LOCATION:${escapeIcsText(location)}`);
  }
  if (room.latitude !== null && room.longitude !== null) {
    lines.push(`GEO:${room.latitude};${room.longitude}`);
  }
  lines.push(`URL:${roomUrl}`, 'END:VEVENT', 'END:VCALENDAR', '');

  return lines.join('\r\n');
}

export function downloadIcsFile(room: CalendarRoom, origin: string): boolean {
  const content = buildIcsContent(room, origin);
  if (!content || typeof document === 'undefined' || typeof URL === 'undefined') {
    return false;
  }

  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
  const blobUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = blobUrl;
  anchor.download = `karaoke-${room.code.toLowerCase()}.ics`;
  anchor.style.display = 'none';
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
  return true;
}
