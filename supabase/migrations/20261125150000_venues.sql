-- Karaokê Live — Perfis de Estabelecimento (venues) e horários recorrentes

create table public.venues (
  id uuid primary key default uuid_generate_v4(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  slug text not null unique,
  description text,
  address text,
  instagram_handle text,
  latitude double precision,
  longitude double precision,
  google_place_id text,
  timezone text not null default 'America/Sao_Paulo',
  is_public boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint venues_name_length_check check (char_length(trim(name)) between 1 and 160),
  constraint venues_slug_length_check check (char_length(trim(slug)) between 2 and 100),
  constraint venues_coordinates_pair_check check ((latitude is null) = (longitude is null)),
  constraint venues_latitude_range_check check (latitude between -90 and 90),
  constraint venues_longitude_range_check check (longitude between -180 and 180),
  constraint venues_google_place_id_not_blank_check check (google_place_id is null or char_length(trim(google_place_id)) > 0),
  constraint venues_timezone_not_blank_check check (char_length(trim(timezone)) > 0)
);

create index venues_owner_id_idx on public.venues (owner_id);
create index venues_public_idx on public.venues (is_public) where is_public = true;

create table public.venue_schedules (
  id uuid primary key default uuid_generate_v4(),
  venue_id uuid not null references public.venues(id) on delete cascade,
  day_of_week integer not null,
  start_time text not null,
  duration_minutes integer not null default 240,
  label text,
  constraint venue_schedules_day_check check (day_of_week between 0 and 6),
  constraint venue_schedules_time_check check (start_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  constraint venue_schedules_duration_check check (duration_minutes between 30 and 720)
);

create index venue_schedules_venue_id_idx on public.venue_schedules (venue_id);

alter table public.rooms
  add column venue_id uuid references public.venues(id) on delete set null;

create index rooms_venue_active_idx
  on public.rooms (venue_id)
  where ended_at is null and venue_id is not null;

-- =========================================================
-- RLS: venues e venue_schedules
-- =========================================================
alter table public.venues enable row level security;
alter table public.venue_schedules enable row level security;

create policy "venues_select"
  on public.venues for select
  to authenticated
  using (is_public = true or owner_id = auth.uid());

create policy "venues_insert"
  on public.venues for insert
  to authenticated
  with check (owner_id = auth.uid());

create policy "venues_update"
  on public.venues for update
  to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy "venues_delete"
  on public.venues for delete
  to authenticated
  using (owner_id = auth.uid());

create policy "venue_schedules_select"
  on public.venue_schedules for select
  to authenticated
  using (
    exists (
      select 1 from public.venues v
      where v.id = venue_id and (v.is_public = true or v.owner_id = auth.uid())
    )
  );

create policy "venue_schedules_insert"
  on public.venue_schedules for insert
  to authenticated
  with check (
    exists (
      select 1 from public.venues v
      where v.id = venue_id and v.owner_id = auth.uid()
    )
  );

create policy "venue_schedules_update"
  on public.venue_schedules for update
  to authenticated
  using (
    exists (
      select 1 from public.venues v
      where v.id = venue_id and v.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.venues v
      where v.id = venue_id and v.owner_id = auth.uid()
    )
  );

create policy "venue_schedules_delete"
  on public.venue_schedules for delete
  to authenticated
  using (
    exists (
      select 1 from public.venues v
      where v.id = venue_id and v.owner_id = auth.uid()
    )
  );

grant select, insert, update, delete on public.venues to authenticated;
grant select, insert, update, delete on public.venue_schedules to authenticated;

-- =========================================================
-- RPC: open_venue_session
-- Abre a fila do dia para um estabelecimento (ou retorna a sala ativa existente).
-- =========================================================
create or replace function public.open_venue_session(
  p_venue_id uuid,
  p_name text default null,
  p_is_public boolean default true,
  p_scheduled_at timestamptz default null,
  p_scheduled_end_at timestamptz default null
)
returns public.rooms
language plpgsql
security definer
set search_path = public
as $$
declare
  v_venue public.venues;
  v_existing public.rooms;
  v_room public.rooms;
  v_code text;
  v_alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_attempt int;
  v_i int;
  v_room_name text;
begin
  select * into v_venue
  from public.venues
  where id = p_venue_id and owner_id = auth.uid();

  if v_venue.id is null then
    raise exception 'venue_not_found_or_forbidden' using errcode = '42501';
  end if;

  select * into v_existing
  from public.rooms
  where venue_id = p_venue_id and ended_at is null
  order by created_at desc
  limit 1;

  if v_existing.id is not null then
    return v_existing;
  end if;

  v_room_name := coalesce(nullif(trim(p_name), ''), v_venue.name);
  if char_length(v_room_name) > 80 then
    v_room_name := left(v_room_name, 80);
  end if;

  for v_attempt in 1..5 loop
    v_code := '';
    for v_i in 1..6 loop
      v_code := v_code || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1);
    end loop;

    begin
      insert into public.rooms (
        code,
        host_id,
        name,
        venue_id,
        venue_name,
        latitude,
        longitude,
        google_place_id,
        event_timezone,
        is_public,
        scheduled_at,
        scheduled_end_at,
        started_at
      )
      values (
        v_code,
        auth.uid(),
        v_room_name,
        v_venue.id,
        v_venue.name,
        v_venue.latitude,
        v_venue.longitude,
        v_venue.google_place_id,
        v_venue.timezone,
        coalesce(p_is_public, true),
        p_scheduled_at,
        p_scheduled_end_at,
        case when p_scheduled_at is null then now() else null end
      )
      returning * into v_room;

      return v_room;
    exception when unique_violation then
      -- Tenta outro código se colidir
    end;
  end loop;

  raise exception 'could_not_generate_code';
end;
$$;

revoke all on function public.open_venue_session(uuid, text, boolean, timestamptz, timestamptz) from public, anon;
grant execute on function public.open_venue_session(uuid, text, boolean, timestamptz, timestamptz) to authenticated;
