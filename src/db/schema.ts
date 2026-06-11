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
    endedAt: timestamp('ended_at', { withTimezone: true }),
    latitude: doublePrecision('latitude').notNull(),
    longitude: doublePrecision('longitude').notNull(),
  },
  (t) => [
    index('rooms_host_id_idx').on(t.hostId),
    index('rooms_code_idx').on(t.code),
    check('rooms_code_length', sql`char_length(${t.code}) = 6`),
    check(
      'rooms_name_length_check',
      sql`char_length(trim(${t.name})) between 1 and 80`,
    ),
    check('rooms_latitude_range_check', sql`${t.latitude} between -90 and 90`),
    check('rooms_longitude_range_check', sql`${t.longitude} between -180 and 180`),
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

export type Profile = typeof profiles.$inferSelect;
export type Room = typeof rooms.$inferSelect;
export type RoomInsert = typeof rooms.$inferInsert;
export type QueueItem = typeof queueItems.$inferSelect;
export type QueueItemInsert = typeof queueItems.$inferInsert;
export type RoomParticipantRow = typeof roomParticipants.$inferSelect;
