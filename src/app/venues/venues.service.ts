import { Injectable, inject } from '@angular/core';
import { AuthService } from '../auth/auth.service';
import { SupabaseService } from '../supabase.service';
import { NewVenue, NewVenueSchedule, Room, Venue, VenueSchedule } from '../types';
import { slugifyVenueName } from '../utils/venue-schedule';

export interface VenueWithDetails extends Venue {
  readonly schedules: ReadonlyArray<VenueSchedule>;
  readonly activeRoom: Pick<Room, 'id' | 'code' | 'name' | 'started_at' | 'scheduled_at'> | null;
}

@Injectable({ providedIn: 'root' })
export class VenuesService {
  private readonly supabase = inject(SupabaseService);
  private readonly auth = inject(AuthService);

  async listMyVenues(): Promise<VenueWithDetails[]> {
    const userId = this.auth.user()?.id;
    if (!userId) return [];

    const { data, error } = await this.supabase.client
      .from('venues')
      .select('*, venue_schedules(*), rooms(id, code, name, started_at, scheduled_at, ended_at)')
      .eq('owner_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw new Error(error.message);
    return (data ?? []).map((row) => this.mapVenueRow(row));
  }

  async listPublicVenues(): Promise<VenueWithDetails[]> {
    const { data, error } = await this.supabase.client
      .from('venues')
      .select('*, venue_schedules(*), rooms(id, code, name, started_at, scheduled_at, ended_at)')
      .eq('is_public', true)
      .order('name', { ascending: true })
      .limit(50);

    if (error) throw new Error(error.message);
    return (data ?? []).map((row) => this.mapVenueRow(row));
  }

  async getVenueBySlug(slug: string): Promise<VenueWithDetails | null> {
    const { data, error } = await this.supabase.client
      .from('venues')
      .select('*, venue_schedules(*), rooms(id, code, name, started_at, scheduled_at, ended_at)')
      .eq('slug', slug)
      .maybeSingle();

    if (error) throw new Error(error.message);
    return data ? this.mapVenueRow(data) : null;
  }

  async createVenue(
    input: Omit<NewVenue, 'slug'>,
    schedules: ReadonlyArray<NewVenueSchedule>,
  ): Promise<VenueWithDetails> {
    const userId = this.auth.user()?.id;
    if (!userId) throw new Error('not_authenticated');

    const slug = slugifyVenueName(input.name);
    const { data: venue, error } = await this.supabase.client
      .from('venues')
      .insert({
        ...input,
        slug,
        owner_id: userId,
      })
      .select('*')
      .single();

    if (error || !venue) throw new Error(error?.message ?? 'create_venue_failed');

    let savedSchedules: VenueSchedule[] = [];
    if (schedules.length > 0) {
      const { data: schedData, error: schedError } = await this.supabase.client
        .from('venue_schedules')
        .insert(schedules.map((s) => ({ ...s, venue_id: venue.id })))
        .select('*');
      if (schedError) throw new Error(schedError.message);
      savedSchedules = schedData ?? [];
    }

    return { ...venue, schedules: savedSchedules, activeRoom: null };
  }

  async updateVenue(
    venueId: string,
    input: Partial<Omit<NewVenue, 'slug'>>,
    schedules: ReadonlyArray<NewVenueSchedule>,
  ): Promise<VenueWithDetails> {
    const { data: venue, error } = await this.supabase.client
      .from('venues')
      .update({ ...input, updated_at: new Date().toISOString() })
      .eq('id', venueId)
      .select('*')
      .single();

    if (error || !venue) throw new Error(error?.message ?? 'update_venue_failed');

    const { error: deleteError } = await this.supabase.client
      .from('venue_schedules')
      .delete()
      .eq('venue_id', venueId);
    if (deleteError) throw new Error(deleteError.message);

    let savedSchedules: VenueSchedule[] = [];
    if (schedules.length > 0) {
      const { data: schedData, error: schedError } = await this.supabase.client
        .from('venue_schedules')
        .insert(schedules.map((s) => ({ ...s, venue_id: venueId })))
        .select('*');
      if (schedError) throw new Error(schedError.message);
      savedSchedules = schedData ?? [];
    }

    return { ...venue, schedules: savedSchedules, activeRoom: null };
  }

  async deleteVenue(venueId: string): Promise<void> {
    const { error } = await this.supabase.client.from('venues').delete().eq('id', venueId);
    if (error) throw new Error(error.message);
  }

  async openVenueSession(
    venueId: string,
    options?: {
      name?: string | null;
      isPublic?: boolean;
      scheduledAt?: string | null;
      scheduledEndAt?: string | null;
    },
  ): Promise<Room> {
    const { data, error } = await this.supabase.client.rpc('open_venue_session', {
      p_venue_id: venueId,
      p_name: options?.name ?? null,
      p_is_public: options?.isPublic ?? true,
      p_scheduled_at: options?.scheduledAt ?? null,
      p_scheduled_end_at: options?.scheduledEndAt ?? null,
    });
    if (error || !data) throw new Error(error?.message ?? 'open_session_failed');
    return data;
  }

  private mapVenueRow(
    row: Venue & {
      venue_schedules?: VenueSchedule[] | null;
      rooms?: Array<Pick<Room, 'id' | 'code' | 'name' | 'started_at' | 'scheduled_at' | 'ended_at'>> | null;
    },
  ): VenueWithDetails {
    const { venue_schedules, rooms, ...venue } = row;
    const active = (rooms ?? []).find((r) => r.ended_at === null) ?? null;
    return {
      ...venue,
      schedules: [...(venue_schedules ?? [])].sort((a, b) =>
        a.day_of_week !== b.day_of_week
          ? a.day_of_week - b.day_of_week
          : a.start_time.localeCompare(b.start_time),
      ),
      activeRoom: active
        ? {
            id: active.id,
            code: active.code,
            name: active.name,
            started_at: active.started_at,
            scheduled_at: active.scheduled_at,
          }
        : null,
    };
  }
}
