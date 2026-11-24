-- Preserve account membership independently of realtime presence.
create table public.room_memberships (
  room_id uuid not null references public.rooms on delete cascade,
  user_id uuid not null references public.profiles on delete cascade,
  last_joined_at timestamptz not null default now(),
  left_at timestamptz,
  primary key (room_id, user_id)
);

create index room_memberships_user_last_joined_idx
  on public.room_memberships (user_id, last_joined_at desc);

alter table public.room_memberships enable row level security;
revoke all on public.room_memberships from public, anon, authenticated;
grant select, update (left_at) on public.room_memberships to authenticated;

create policy "room_memberships_select_self"
  on public.room_memberships for select to authenticated
  using (user_id = (select auth.uid()));

create policy "room_memberships_update_self"
  on public.room_memberships for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- A queue entry can recover a visit after its presence row has disappeared.
insert into public.room_memberships (room_id, user_id, last_joined_at, left_at)
select room_id, user_id, max(created_at), max(created_at)
from public.queue_items
group by room_id, user_id;

insert into public.room_memberships (room_id, user_id, last_joined_at)
select room_id, user_id, joined_at
from public.room_participants
on conflict (room_id, user_id) do update
set last_joined_at = greatest(excluded.last_joined_at, room_memberships.last_joined_at),
    left_at = null;

insert into public.room_memberships (room_id, user_id, last_joined_at)
select id, host_id, created_at
from public.rooms
on conflict (room_id, user_id) do update set left_at = null;

create function public.record_room_join()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.room_memberships (room_id, user_id)
  values (new.room_id, new.user_id)
  on conflict (room_id, user_id) do update
  set last_joined_at = excluded.last_joined_at, left_at = null;
  return new;
end;
$$;

revoke all on function public.record_room_join() from public, anon, authenticated;

-- Join uses an upsert with display_name. Heartbeat only writes last_seen_at.
create trigger room_participants_record_join
  after insert or update of display_name on public.room_participants
  for each row execute function public.record_room_join();

create function public.record_room_host()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.room_memberships (room_id, user_id)
  values (new.id, new.host_id)
  on conflict (room_id, user_id) do update
  set last_joined_at = excluded.last_joined_at, left_at = null;
  return new;
end;
$$;

revoke all on function public.record_room_host() from public, anon, authenticated;

create trigger rooms_record_host
  after insert or update of host_id on public.rooms
  for each row execute function public.record_room_host();

create function public.leave_room_membership(p_room_id uuid)
returns void
language plpgsql security invoker set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  -- Use the same lock order as a join, which writes presence first.
  delete from public.room_participants
  where room_id = p_room_id and user_id = v_user_id;

  update public.room_memberships
  set left_at = now()
  where room_id = p_room_id and user_id = v_user_id and left_at is null;
end;
$$;

revoke all on function public.leave_room_membership(uuid) from public, anon;
grant execute on function public.leave_room_membership(uuid) to authenticated;

-- The ordinary rooms UPDATE policy requires the caller to remain the host.
create function public.transfer_room_host(
  p_room_id uuid,
  p_new_host_id uuid,
  p_leave boolean default false
)
returns public.rooms
language plpgsql security definer set search_path = ''
as $$
declare
  v_room public.rooms;
begin
  update public.rooms r
  set host_id = p_new_host_id
  where r.id = p_room_id
    and r.host_id = auth.uid()
    and r.host_id <> p_new_host_id
    and r.ended_at is null
    and exists (
      select 1 from public.room_memberships m
      where m.room_id = r.id and m.user_id = p_new_host_id and m.left_at is null
    )
  returning r.* into v_room;

  if not found then
    raise exception 'invalid_host_transfer' using errcode = '42501';
  end if;

  if p_leave then
    perform public.leave_room_membership(p_room_id);
  end if;

  return v_room;
end;
$$;

revoke all on function public.transfer_room_host(uuid, uuid, boolean) from public, anon;
grant execute on function public.transfer_room_host(uuid, uuid, boolean) to authenticated;
