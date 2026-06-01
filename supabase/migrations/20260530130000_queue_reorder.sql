-- Karaokê Live — reordenação da fila pelo host
-- RPC reorder_queue(room_id, item_ids[]): só o host da sala pode reordenar.
-- Reatribui as positions atuais (sorted asc) na nova ordem dos IDs — mantém o
-- range existente para não colidir com itens done/now_playing.

create or replace function public.reorder_queue(
  p_room_id uuid,
  p_item_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_host boolean;
  v_count int;
  v_expected_count int := coalesce(array_length(p_item_ids, 1), 0);
begin
  -- Só o host reordena.
  select exists (
    select 1 from public.rooms where id = p_room_id and host_id = auth.uid()
  ) into v_is_host;

  if not v_is_host then
    raise exception 'not_host';
  end if;

  -- Os IDs precisam ser todos itens 'pending' desta sala.
  select count(*) into v_count
    from public.queue_items
    where id = any(p_item_ids)
      and room_id = p_room_id
      and status = 'pending';

  if v_count <> v_expected_count then
    raise exception 'invalid_item_ids';
  end if;

  -- Reatribui as positions atuais (asc) na nova ordem dos IDs.
  with item_order as (
    select v.id, v.ord
    from unnest(p_item_ids) with ordinality as v(id, ord)
  ),
  current_positions as (
    select position, row_number() over (order by position asc) as slot
    from public.queue_items
    where id = any(p_item_ids)
  )
  update public.queue_items qi
    set position = cp.position
    from item_order io
    join current_positions cp on cp.slot = io.ord
    where qi.id = io.id;
end;
$$;

grant execute on function public.reorder_queue(uuid, uuid[]) to authenticated;
