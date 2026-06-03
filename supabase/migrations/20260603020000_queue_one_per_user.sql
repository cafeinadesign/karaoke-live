-- Karaokê Live — limite de 1 música ativa por usuário até a vez passar
-- Bloqueia novos enfileiramentos enquanto o usuário tiver uma música 'pending'
-- ou 'now_playing' na mesma sala. A troca (replace_queue_item_video) e o
-- avanço da fila continuam funcionando porque mexem em itens existentes,
-- não inserem novos. Quando a música vira 'done'/'skipped', libera de novo.

-- =========================================================
-- 1) RPC enqueue_item: check explícito com exception clara
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
  if exists (
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

-- =========================================================
-- 2) RLS: defesa em profundidade — mesmo via insert direto, o limite vale
-- =========================================================
drop policy if exists "queue_items_insert_self" on public.queue_items;

create policy "queue_items_insert_self"
  on public.queue_items for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.rooms r
      where r.id = room_id and r.ended_at is null
    )
    and not exists (
      select 1 from public.queue_items q
      where q.room_id = room_id
        and q.user_id = auth.uid()
        and q.status in ('pending', 'now_playing')
    )
  );
