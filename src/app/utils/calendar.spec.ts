import { beforeAll, describe, expect, it } from 'vitest';
import {
  CalendarRoom,
  buildGoogleCalendarUrl,
  buildIcsContent,
  ensureTemporal,
  formatEventDateTime,
  resolveEventInterval,
} from './calendar';

const baseRoom: CalendarRoom = {
  id: 'room-uuid-123',
  code: 'ABC123',
  name: 'Sexta de Karaokê, Bar & Amigos',
  scheduled_at: '2026-12-04T23:00:00.000Z',
  scheduled_end_at: '2026-12-05T02:00:00.000Z',
  event_timezone: 'America/Sao_Paulo',
  venue_name: 'Bar do Sol, 42; Recife',
  latitude: -8.0476,
  longitude: -34.877,
};

describe('calendar utilities', () => {
  beforeAll(async () => {
    await ensureTemporal();
  });

  it('resolves a wall-clock date/time in an IANA timezone and computes end time', () => {
    const interval = resolveEventInterval('2026-12-04', '20:00', 3, 'America/Sao_Paulo');
    expect(interval).toEqual({
      startIso: '2026-12-04T23:00:00Z',
      endIso: '2026-12-05T02:00:00Z',
      timeZone: 'America/Sao_Paulo',
      hasDstConflict: false,
    });
  });

  it('detects DST spring-forward skipped hours while resolving compatibly', () => {
    const interval = resolveEventInterval('2025-03-09', '02:30', 2, 'America/New_York');
    expect(interval).not.toBeNull();
    expect(interval!.hasDstConflict).toBe(true);
    expect(interval!.timeZone).toBe('America/New_York');
  });

  it('builds a Google Calendar template URL with UTC dates, location, ctz, and invite link', () => {
    const href = buildGoogleCalendarUrl(baseRoom, 'https://karaoke-live.app.br/');
    expect(href).not.toBeNull();
    const parsed = new URL(href!);
    expect(parsed.origin).toBe('https://calendar.google.com');
    expect(parsed.searchParams.get('action')).toBe('TEMPLATE');
    expect(parsed.searchParams.get('text')).toBe(baseRoom.name);
    expect(parsed.searchParams.get('dates')).toBe('20261204T230000Z/20261205T020000Z');
    expect(parsed.searchParams.get('location')).toBe(baseRoom.venue_name);
    expect(parsed.searchParams.get('ctz')).toBe('America/Sao_Paulo');
    expect(parsed.searchParams.get('details')).toContain('https://karaoke-live.app.br/mobile/ABC123');
  });

  it('falls back to a 3-hour duration when scheduled_end_at is missing', () => {
    const href = buildGoogleCalendarUrl(
      { ...baseRoom, scheduled_end_at: null },
      'https://karaoke-live.app.br',
    );
    const parsed = new URL(href!);
    expect(parsed.searchParams.get('dates')).toBe('20261204T230000Z/20261205T020000Z');
  });

  it('returns null for rooms without scheduled_at', () => {
    const noSchedule: CalendarRoom = { ...baseRoom, scheduled_at: null };
    expect(buildGoogleCalendarUrl(noSchedule, 'https://karaoke-live.app.br')).toBeNull();
    expect(buildIcsContent(noSchedule, 'https://karaoke-live.app.br')).toBeNull();
  });

  it('generates RFC 5545 compliant .ics content with escaped characters', () => {
    const ics = buildIcsContent(
      baseRoom,
      'https://karaoke-live.app.br',
      new Date('2026-11-25T10:00:00.000Z'),
    );
    expect(ics).not.toBeNull();
    const lines = ics!.split('\r\n');
    expect(lines).toContain('BEGIN:VCALENDAR');
    expect(lines).toContain('UID:room-uuid-123@karaoke-live.app.br');
    expect(lines).toContain('DTSTAMP:20261125T100000Z');
    expect(lines).toContain('DTSTART:20261204T230000Z');
    expect(lines).toContain('DTEND:20261205T020000Z');
    expect(lines).toContain('SUMMARY:Sexta de Karaokê\\, Bar & Amigos');
    expect(lines).toContain('LOCATION:Bar do Sol\\, 42\\; Recife');
    expect(lines).toContain('GEO:-8.0476;-34.877');
    expect(lines).toContain('URL:https://karaoke-live.app.br/mobile/ABC123');
    expect(lines).toContain('END:VCALENDAR');
  });

  it('formats scheduled timestamps in the requested timezone', () => {
    const formatted = formatEventDateTime('2026-12-04T23:00:00Z', 'America/Sao_Paulo', 'pt-BR');
    expect(formatted).toContain('20:00');
  });
});
