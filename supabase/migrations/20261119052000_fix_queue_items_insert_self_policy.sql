-- Karaokê Live — correção da política RLS queue_items_insert_self
-- Na migration 20260603020000_queue_one_per_user, a cláusula:
--   not exists (select 1 from public.queue_items q where q.room_id = room_id ...)
-- continha sombreamento de escopo (room_id sem qualificação de tabela foi resolvido
-- internamente pelo Postgres como q.room_id = q.room_id).
-- Isso fazia o check procurar músicas ativas em QUALQUER sala da história do banco,
-- impedindo novos enfileiramentos se houvesse item órfão em salas já encerradas.
--
-- 1) Limpa itens ativos que ficaram órfãos em salas já encerradas (ended_at is not null).
update public.queue_items qi
set status = 'skipped'
from public.rooms r
where qi.room_id = r.id
  and r.ended_at is not null
  and qi.status in ('pending', 'now_playing');

-- 2) Recria a política qualificando explicitamente queue_items.room_id.
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
    and not exists (
      select 1 from public.queue_items q
      where q.room_id = queue_items.room_id
        and q.user_id = auth.uid()
        and q.status in ('pending', 'now_playing')
    )
  );
