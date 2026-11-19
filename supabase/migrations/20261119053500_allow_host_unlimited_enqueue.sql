-- Karaokê Live — liberar enfileiramento ilimitado para o Host da sala
-- O host precisa poder adicionar quantas músicas quiser na fila (ex: abrir o karaokê,
-- montar a playlist inicial, ou enfileirar pedidos de convidados offline).
-- O limite de 1 música ativa ('pending' ou 'now_playing') continua valendo apenas para convidados.

-- 1) Remove o índice único que impedia mais de 1 música ativa por (room_id, user_id)
drop index if exists public.queue_items_one_active_per_user;

-- 2) Atualiza a RPC enqueue_item para isentar o host do limite de 1 música ativa
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
  v_is_host boolean;
begin
  -- Checa se o usuário chamador é o host desta sala
  select (host_id = auth.uid())
    into v_is_host
    from public.rooms
    where id = p_room_id;

  -- Se não for o host, valida o limite de 1 música ativa
  if not coalesce(v_is_host, false) and exists (
    select 1 from public.queue_items
    where room_id = p_room_id
      and user_id = auth.uid()
      and status in ('pending', 'now_playing')
  ) then
    raise exception 'user_already_has_active_item';
  end if;

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

-- 3) Atualiza a política de RLS para permitir múltiplos inserts caso o usuário seja o host da sala
drop policy if exists "queue_items_insert_self" on public.queue_items;

create policy "queue_items_insert_self"
  on public.queue_items for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.rooms r
      where r.id = queue_items.room_id and r.ended_at is null
    )
    and (
      -- Host pode enfileirar ilimitadamente:
      exists (
        select 1 from public.rooms r
        where r.id = queue_items.room_id and r.host_id = auth.uid()
      )
      or
      -- Convidado é restrito a 1 música ativa:
      not exists (
        select 1 from public.queue_items q
        where q.room_id = queue_items.room_id
          and q.user_id = auth.uid()
          and q.status in ('pending', 'now_playing')
      )
    )
  );
