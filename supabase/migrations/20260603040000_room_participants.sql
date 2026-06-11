-- Karaokê Live — substitui Supabase Realtime Presence por tabela durável
-- Presence flutuava em rede ruim e perdia gente. room_participants é a
-- source of truth: UPSERT no join, heartbeat 30s atualiza last_seen_at,
-- DELETE no leave. Sub via postgres_changes (mesmo motor confiável da queue).
-- isHost é derivado em runtime de rooms.host_id (sem precisar sync extra).

create table public.room_participants (
  room_id uuid not null references public.rooms on delete cascade,
  user_id uuid not null references public.profiles on delete cascade,
  display_name text not null,
  avatar_url text,
  joined_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  primary key (room_id, user_id)
);

create index room_participants_last_seen_idx
  on public.room_participants (room_id, last_seen_at);

alter table public.room_participants enable row level security;

-- Qualquer autenticado pode ver — quem entra na sala vê quem mais tá lá.
create policy "room_participants_select_authenticated"
  on public.room_participants for select
  to authenticated
  using (true);

-- Insert: só pra si mesmo, e só em sala não encerrada.
create policy "room_participants_insert_self"
  on public.room_participants for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.rooms r
      where r.id = room_id and r.ended_at is null
    )
  );

-- Update: só a própria linha (pro heartbeat).
create policy "room_participants_update_self"
  on public.room_participants for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Delete: a própria linha OU o host da sala (futura feature de kick).
create policy "room_participants_delete_self_or_host"
  on public.room_participants for delete
  to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.rooms r
      where r.id = room_id and r.host_id = auth.uid()
    )
  );

-- Realtime: postgres_changes precisa da tabela na publicação.
alter publication supabase_realtime add table public.room_participants;
