-- Karaokê Live — eventos futuros (agendamento, visibilidade pública e abertura manual)
-- Adiciona suporte a eventos agendados com pré-fila e início manual pelo host.

alter table public.rooms
  add column scheduled_at timestamptz,
  add column scheduled_end_at timestamptz,
  add column event_timezone text,
  add column started_at timestamptz default now(),
  add column is_public boolean not null default false;

-- Salas já existentes estavam ao vivo desde a criação.
update public.rooms
set started_at = created_at
where started_at is null;

alter table public.rooms
  add constraint rooms_schedule_pair_check
    check (
      scheduled_end_at is null
      or (scheduled_at is not null and scheduled_end_at > scheduled_at)
    ),
  add constraint rooms_event_timezone_not_blank_check
    check (event_timezone is null or char_length(trim(event_timezone)) > 0);

create index rooms_public_active_idx
  on public.rooms (is_public, scheduled_at)
  where ended_at is null and is_public = true;

-- =========================================================
-- RPC: start_room(p_room_id)
-- Host inicia manualmente um evento agendado (antes ou depois do horário).
-- =========================================================
create or replace function public.start_room(p_room_id uuid)
returns public.rooms
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room public.rooms;
begin
  update public.rooms r
  set started_at = coalesce(r.started_at, now())
  where r.id = p_room_id
    and r.host_id = auth.uid()
    and r.ended_at is null
  returning r.* into v_room;

  if not found then
    raise exception 'cannot_start_room' using errcode = '42501';
  end if;

  return v_room;
end;
$$;

revoke all on function public.start_room(uuid) from public, anon;
grant execute on function public.start_room(uuid) to authenticated;

-- =========================================================
-- RPC: advance_queue(p_room_id)
-- Bloqueia o avanço do player enquanto o evento ainda não foi iniciado pelo host.
-- =========================================================
create or replace function public.advance_queue(p_room_id uuid)
returns public.queue_items
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next public.queue_items;
  v_room public.rooms;
begin
  select * into v_room
  from public.rooms
  where id = p_room_id;

  if v_room.id is null or v_room.host_id <> auth.uid() then
    raise exception 'not_host';
  end if;

  if v_room.ended_at is not null then
    raise exception 'room_ended';
  end if;

  if v_room.started_at is null then
    raise exception 'room_not_started';
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
