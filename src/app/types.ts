import { Database } from './database.types';

export type Profile = Database['public']['Tables']['profiles']['Row'];
export type Room = Database['public']['Tables']['rooms']['Row'];
export type QueueItem = Database['public']['Tables']['queue_items']['Row'];
export type QueueStatus = 'pending' | 'now_playing' | 'done' | 'skipped';

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
