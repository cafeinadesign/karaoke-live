import { Database } from './database.types';

export type Profile = Database['public']['Tables']['profiles']['Row'];
export type Room = Database['public']['Tables']['rooms']['Row'];
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
