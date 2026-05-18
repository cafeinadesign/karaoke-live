-- Karaokê Live — schema inicial
-- profiles, rooms, queue_items + RLS + Realtime + RPC advance_queue.

create extension if not exists "uuid-ossp";

-- =========================================================
-- profiles (espelho de auth.users)
-- =========================================================
create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles_select_authenticated"
  on public.profiles for select
  to authenticated
  using (true);

create policy "profiles_update_self"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Trigger: cria profile no signup pegando metadata do provider OAuth.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =========================================================
-- rooms
-- =========================================================
create table public.rooms (
  id uuid primary key default uuid_generate_v4(),
  code text unique not null check (char_length(code) = 6),
  host_id uuid not null references public.profiles on delete cascade,
  name text,
  current_item_id uuid,
  created_at timestamptz not null default now(),
  ended_at timestamptz
);

create index rooms_host_id_idx on public.rooms (host_id);
create index rooms_code_idx on public.rooms (code);

alter table public.rooms enable row level security;

create policy "rooms_select_authenticated"
  on public.rooms for select
  to authenticated
  using (true);

create policy "rooms_insert_self_as_host"
  on public.rooms for insert
  to authenticated
  with check (host_id = auth.uid());

create policy "rooms_update_host_only"
  on public.rooms for update
  to authenticated
  using (host_id = auth.uid())
  with check (host_id = auth.uid());

create policy "rooms_delete_host_only"
  on public.rooms for delete
  to authenticated
  using (host_id = auth.uid());

-- =========================================================
-- queue_items
-- =========================================================
create table public.queue_items (
  id uuid primary key default uuid_generate_v4(),
  room_id uuid not null references public.rooms on delete cascade,
  user_id uuid not null references public.profiles on delete cascade,
  video_id text not null,
  video_title text not null,
  video_thumbnail text,
  video_duration_seconds int,
  position int not null,
  status text not null default 'pending' check (status in ('pending','now_playing','done','skipped')),
  gemini_message text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);

create index queue_items_room_position_idx on public.queue_items (room_id, position);
create index queue_items_room_status_idx on public.queue_items (room_id, status);

alter table public.queue_items enable row level security;

-- Qualquer autenticado pode SELECT (a app filtra por room_id; protege quem sabe o código).
create policy "queue_items_select_authenticated"
  on public.queue_items for select
  to authenticated
  using (true);

-- Convidado só insere para si mesmo, em sala existente e não encerrada.
create policy "queue_items_insert_self"
  on public.queue_items for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.rooms r
      where r.id = room_id and r.ended_at is null
    )
  );

-- Update: só host da sala (controla status/position).
create policy "queue_items_update_host"
  on public.queue_items for update
  to authenticated
  using (
    exists (
      select 1 from public.rooms r
      where r.id = room_id and r.host_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.rooms r
      where r.id = room_id and r.host_id = auth.uid()
    )
  );

-- Delete: host OU dono do item se ainda 'pending'.
create policy "queue_items_delete_host_or_owner_pending"
  on public.queue_items for delete
  to authenticated
  using (
    exists (
      select 1 from public.rooms r
      where r.id = room_id and r.host_id = auth.uid()
    )
    or (user_id = auth.uid() and status = 'pending')
  );

-- =========================================================
-- RPC: advance_queue(room_id)
-- Avança a fila de forma atômica e retorna o próximo item (ou null).
-- =========================================================
create or replace function public.advance_queue(p_room_id uuid)
returns public.queue_items
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next public.queue_items;
  v_is_host boolean;
begin
  select exists (
    select 1 from public.rooms where id = p_room_id and host_id = auth.uid()
  ) into v_is_host;

  if not v_is_host then
    raise exception 'not_host';
  end if;

  update public.queue_items
    set status = 'done', finished_at = now()
    where room_id = p_room_id and status = 'now_playing';

  select * into v_next
  from public.queue_items
  where room_id = p_room_id and status = 'pending'
  order by position asc
  limit 1;

  if v_next.id is not null then
    update public.queue_items
      set status = 'now_playing', started_at = now()
      where id = v_next.id
      returning * into v_next;
  end if;

  update public.rooms
    set current_item_id = v_next.id
    where id = p_room_id;

  return v_next;
end;
$$;

grant execute on function public.advance_queue(uuid) to authenticated;

-- =========================================================
-- RPC: enqueue_item — calcula próximo position e insere
-- =========================================================
create or replace function public.enqueue_item(
  p_room_id uuid,
  p_video_id text,
  p_video_title text,
  p_video_thumbnail text,
  p_video_duration_seconds int
)
returns public.queue_items
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_next_pos int;
  v_item public.queue_items;
begin
  select coalesce(max(position), 0) + 1
    into v_next_pos
    from public.queue_items
    where room_id = p_room_id;

  insert into public.queue_items (
    room_id, user_id, video_id, video_title, video_thumbnail,
    video_duration_seconds, position, status
  ) values (
    p_room_id, auth.uid(), p_video_id, p_video_title, p_video_thumbnail,
    p_video_duration_seconds, v_next_pos, 'pending'
  )
  returning * into v_item;

  return v_item;
end;
$$;

grant execute on function public.enqueue_item(uuid, text, text, text, int) to authenticated;

-- =========================================================
-- Realtime
-- =========================================================
alter publication supabase_realtime add table public.queue_items;
alter publication supabase_realtime add table public.rooms;
