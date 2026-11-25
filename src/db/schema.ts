import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  doublePrecision,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

/**
 * Source of truth do schema. drizzle-kit gera diffs em SQL a partir deste
 * arquivo; depois movemos pra supabase/migrations/<timestamp>_<name>.sql e
 * aplicamos com `supabase db push` (assim mantemos o fluxo do Supabase e
 * a versionagem por timestamp). RLS, RPCs e triggers seguem como SQL puro
 * dentro das migrations — Drizzle não modela essas coisas.
 *
 * O FK profiles.id → auth.users existe na DB mas não é declarado aqui
 * porque o schema auth fica fora do escopo do Drizzle.
 */

// =========================================================
// profiles (espelho de auth.users)
// =========================================================
export const profiles = pgTable('profiles', {
  id: uuid('id').primaryKey(),
  displayName: text('display_name'),
  avatarUrl: text('avatar_url'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// =========================================================
// venues (estabelecimentos com karaokê rotineiro)
// =========================================================
export const venues = pgTable(
  'venues',
  {
    id: uuid('id').primaryKey().default(sql`uuid_generate_v4()`),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    slug: text('slug').notNull().unique(),
    description: text('description'),
    address: text('address'),
    instagramHandle: text('instagram_handle'),
    latitude: doublePrecision('latitude'),
    longitude: doublePrecision('longitude'),
    googlePlaceId: text('google_place_id'),
    timezone: text('timezone').notNull().default('America/Sao_Paulo'),
    isPublic: boolean('is_public').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('venues_owner_id_idx').on(t.ownerId),
    index('venues_public_idx')
      .on(t.isPublic)
      .where(sql`${t.isPublic} = true`),
    check('venues_name_length_check', sql`char_length(trim(${t.name})) between 1 and 160`),
    check('venues_slug_length_check', sql`char_length(trim(${t.slug})) between 2 and 100`),
    check('venues_coordinates_pair_check', sql`(${t.latitude} is null) = (${t.longitude} is null)`),
    check('venues_latitude_range_check', sql`${t.latitude} between -90 and 90`),
    check('venues_longitude_range_check', sql`${t.longitude} between -180 and 180`),
    check(
      'venues_google_place_id_not_blank_check',
      sql`${t.googlePlaceId} is null or char_length(trim(${t.googlePlaceId})) > 0`,
    ),
    check(
      'venues_timezone_not_blank_check',
      sql`char_length(trim(${t.timezone})) > 0`,
    ),
  ],
);

// =========================================================
// venue_schedules (horários semanais do estabelecimento)
// =========================================================
export const venueSchedules = pgTable(
  'venue_schedules',
  {
    id: uuid('id').primaryKey().default(sql`uuid_generate_v4()`),
    venueId: uuid('venue_id')
      .notNull()
      .references(() => venues.id, { onDelete: 'cascade' }),
    dayOfWeek: integer('day_of_week').notNull(),
    startTime: text('start_time').notNull(),
    durationMinutes: integer('duration_minutes').notNull().default(240),
    label: text('label'),
  },
  (t) => [
    index('venue_schedules_venue_id_idx').on(t.venueId),
    check('venue_schedules_day_check', sql`${t.dayOfWeek} between 0 and 6`),
    check('venue_schedules_time_check', sql`${t.startTime} ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'`),
    check('venue_schedules_duration_check', sql`${t.durationMinutes} between 30 and 720`),
  ],
);

// =========================================================
// rooms
// =========================================================
export const rooms = pgTable(
  'rooms',
  {
    id: uuid('id').primaryKey().default(sql`uuid_generate_v4()`),
    code: text('code').notNull().unique(),
    hostId: uuid('host_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    currentItemId: uuid('current_item_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    scheduledAt: timestamp('scheduled_at', { withTimezone: true }),
    scheduledEndAt: timestamp('scheduled_end_at', { withTimezone: true }),
    eventTimezone: text('event_timezone'),
    startedAt: timestamp('started_at', { withTimezone: true }).defaultNow(),
    endedAt: timestamp('ended_at', { withTimezone: true }),
    isPublic: boolean('is_public').notNull().default(false),
    latitude: doublePrecision('latitude'),
    longitude: doublePrecision('longitude'),
    venueName: text('venue_name'),
    googlePlaceId: text('google_place_id'),
    venueId: uuid('venue_id').references(() => venues.id, { onDelete: 'set null' }),
  },
  (t) => [
    index('rooms_host_id_idx').on(t.hostId),
    index('rooms_code_idx').on(t.code),
    index('rooms_venue_active_idx')
      .on(t.venueId)
      .where(sql`${t.endedAt} is null and ${t.venueId} is not null`),
    index('rooms_public_active_idx')
      .on(t.isPublic, t.scheduledAt)
      .where(sql`${t.endedAt} is null and ${t.isPublic} = true`),
    check('rooms_code_length', sql`char_length(${t.code}) = 6`),
    check(
      'rooms_name_length_check',
      sql`char_length(trim(${t.name})) between 1 and 80`,
    ),
    check('rooms_coordinates_pair_check', sql`(${t.latitude} is null) = (${t.longitude} is null)`),
    check('rooms_venue_name_length_check', sql`char_length(trim(${t.venueName})) between 1 and 160`),
    check('rooms_google_place_id_not_blank_check', sql`char_length(trim(${t.googlePlaceId})) > 0`),
    check('rooms_latitude_range_check', sql`${t.latitude} between -90 and 90`),
    check('rooms_longitude_range_check', sql`${t.longitude} between -180 and 180`),
    check(
      'rooms_schedule_pair_check',
      sql`${t.scheduledEndAt} is null or (${t.scheduledAt} is not null and ${t.scheduledEndAt} > ${t.scheduledAt})`,
    ),
    check(
      'rooms_event_timezone_not_blank_check',
      sql`${t.eventTimezone} is null or char_length(trim(${t.eventTimezone})) > 0`,
    ),
  ],
);

// =========================================================
// queue_items
// =========================================================
export const queueItems = pgTable(
  'queue_items',
  {
    id: uuid('id').primaryKey().default(sql`uuid_generate_v4()`),
    roomId: uuid('room_id')
      .notNull()
      .references(() => rooms.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    videoId: text('video_id').notNull(),
    videoTitle: text('video_title').notNull(),
    videoThumbnail: text('video_thumbnail'),
    videoDurationSeconds: integer('video_duration_seconds'),
    position: integer('position').notNull(),
    status: text('status').notNull().default('pending'),
    geminiMessage: text('gemini_message'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
  },
  (t) => [
    index('queue_items_room_position_idx').on(t.roomId, t.position),
    index('queue_items_room_status_idx').on(t.roomId, t.status),
    uniqueIndex('queue_items_one_active_per_user')
      .on(t.roomId, t.userId)
      .where(sql`${t.status} in ('pending', 'now_playing')`),
    check(
      'queue_items_status_check',
      sql`${t.status} in ('pending', 'now_playing', 'done', 'skipped')`,
    ),
  ],
);

// =========================================================
// room_participants — substitui Supabase Realtime Presence
// Tabela como source of truth: UPSERT no join + heartbeat 30s atualizando
// last_seen_at. Leitura filtra zumbis (last_seen_at < now() - 90s). Sub via
// postgres_changes em vez de presence — mesmo motor confiável da queue.
// =========================================================
export const roomParticipants = pgTable(
  'room_participants',
  {
    roomId: uuid('room_id')
      .notNull()
      .references(() => rooms.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    displayName: text('display_name').notNull(),
    avatarUrl: text('avatar_url'),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.roomId, t.userId] }),
    index('room_participants_last_seen_idx').on(t.roomId, t.lastSeenAt),
  ],
);

export const roomMemberships = pgTable(
  'room_memberships',
  {
    roomId: uuid('room_id')
      .notNull()
      .references(() => rooms.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    lastJoinedAt: timestamp('last_joined_at', { withTimezone: true }).notNull().defaultNow(),
    leftAt: timestamp('left_at', { withTimezone: true }),
  },
  (t) => [
    primaryKey({ columns: [t.roomId, t.userId] }),
    index('room_memberships_user_last_joined_idx').on(t.userId, t.lastJoinedAt.desc()),
  ],
);

export type Profile = typeof profiles.$inferSelect;
export type Room = typeof rooms.$inferSelect;
export type RoomInsert = typeof rooms.$inferInsert;
export type QueueItem = typeof queueItems.$inferSelect;
export type QueueItemInsert = typeof queueItems.$inferInsert;
export type RoomParticipantRow = typeof roomParticipants.$inferSelect;
