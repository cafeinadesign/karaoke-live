import { Database } from './database.types';

export type Profile = Database['public']['Tables']['profiles']['Row'];
export type Room = Database['public']['Tables']['rooms']['Row'];
export type Venue = Database['public']['Tables']['venues']['Row'];
export type VenueSchedule = Database['public']['Tables']['venue_schedules']['Row'];
export type NewVenue = Omit<
  Database['public']['Tables']['venues']['Insert'],
  'id' | 'owner_id' | 'created_at' | 'updated_at'
>;
export type NewVenueSchedule = Omit<
  Database['public']['Tables']['venue_schedules']['Insert'],
  'id' | 'venue_id'
>;
export type NewRoom = Pick<
  Room,
  'name' | 'latitude' | 'longitude' | 'venue_name' | 'google_place_id'
> &
  Partial<
    Pick<
      Room,
      'is_public' | 'scheduled_at' | 'scheduled_end_at' | 'event_timezone' | 'started_at' | 'venue_id'
    >
  >;

export function isRoomScheduled(room: Pick<Room, 'ended_at' | 'started_at'>): boolean {
  return room.ended_at === null && room.started_at === null;
}
export type QueueStatus = 'pending' | 'now_playing' | 'done' | 'skipped';

type QueueItemRow = Database['public']['Tables']['queue_items']['Row'];

/**
 * Row da queue com `status` estreitado pra union — o tipo gerado pelo
 * Supabase não conhece o CHECK constraint e deixa como `string`, o que
 * deixaria typos como `=== 'pendign'` passarem sem erro de compilação.
 */
export type QueueItem = Omit<QueueItemRow, 'status'> & { readonly status: QueueStatus };

export interface VideoResult {
  readonly videoId: string;
  readonly title: string;
  readonly channelTitle: string;
  readonly thumbnail: string;
  readonly durationSeconds: number;
}

export interface Participant {
  readonly userId: string;
  readonly displayName: string;
  readonly avatarUrl: string | null;
  readonly isHost: boolean;
  readonly onlineAt: string;
}
