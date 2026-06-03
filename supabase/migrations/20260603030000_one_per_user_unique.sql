-- Karaokê Live — limite atómico de 1 música ativa por usuário
-- O check em enqueue_item/RLS da migration anterior tinha TOCTOU:
-- entre o `if exists (...)` e o `insert`, outra transação do mesmo usuário
-- (dois aparelhos abertos) podia passar. Esta partial unique index fecha a
-- corrida na camada de dados.

-- 1) Limpa dados legados: se já existir mais de um item ativo por (room, user),
--    marca todos exceto o de menor position como 'skipped'.
update public.queue_items
  set status = 'skipped'
  where id in (
    select id
    from (
      select
        id,
        row_number() over (
          partition by room_id, user_id
          order by position asc
        ) as rn
      from public.queue_items
      where status in ('pending', 'now_playing')
    ) ranked
    where rn > 1
  );

-- 2) Garante atomicamente no máximo 1 item ativo por (room_id, user_id).
--    Inserts que violem disparam unique_violation (sqlstate 23505) e abortam
--    a transação — não passa nem com race entre devices.
create unique index if not exists queue_items_one_active_per_user
  on public.queue_items (room_id, user_id)
  where status in ('pending', 'now_playing');
