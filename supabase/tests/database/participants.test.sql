-- pgTAP: RLS de room_participants — insert/update só self,
-- delete self-ou-host, insert bloqueado em sala encerrada.

begin;
select plan(7);

-- Seed
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000aa', 'host@test.local'),
  ('00000000-0000-0000-0000-0000000000bb', 'guest@test.local');

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000aa","role":"authenticated"}', true);
set local role authenticated;

insert into public.rooms (code, host_id, name, latitude, longitude)
values ('TEST02', '00000000-0000-0000-0000-0000000000aa', 'Sala RLS', 0, 0);

-- =========================================================
-- insert: só pra si mesmo
-- =========================================================
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000bb","role":"authenticated"}', true);

select lives_ok(
  $$insert into public.room_participants (room_id, user_id, display_name)
    values ((select id from public.rooms where code = 'TEST02'),
            '00000000-0000-0000-0000-0000000000bb', 'Guest')$$,
  'participante insere a própria linha'
);

select throws_ok(
  $$insert into public.room_participants (room_id, user_id, display_name)
    values ((select id from public.rooms where code = 'TEST02'),
            '00000000-0000-0000-0000-0000000000aa', 'Imposter')$$,
  '42501', null,
  'não insere linha de outro usuário'
);

-- =========================================================
-- update: heartbeat só na própria linha
-- =========================================================
select lives_ok(
  $$update public.room_participants set last_seen_at = now()
    where user_id = '00000000-0000-0000-0000-0000000000bb'$$,
  'heartbeat na própria linha funciona'
);

-- =========================================================
-- delete: self ou host
-- =========================================================
-- Host entra na sala também
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000aa","role":"authenticated"}', true);

insert into public.room_participants (room_id, user_id, display_name)
values ((select id from public.rooms where code = 'TEST02'),
        '00000000-0000-0000-0000-0000000000aa', 'Host');

-- Guest não consegue deletar a linha do host (0 rows afetadas, sem erro)
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000bb","role":"authenticated"}', true);

delete from public.room_participants
  where user_id = '00000000-0000-0000-0000-0000000000aa';

select is(
  (select count(*) from public.room_participants
   where user_id = '00000000-0000-0000-0000-0000000000aa'),
  1::bigint,
  'guest não deleta a linha do host'
);

-- Host pode deletar a linha do guest (kick)
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000aa","role":"authenticated"}', true);

select lives_ok(
  $$delete from public.room_participants
    where user_id = '00000000-0000-0000-0000-0000000000bb'$$,
  'host deleta linha de participante (kick)'
);

select is(
  (select count(*) from public.room_participants
   where user_id = '00000000-0000-0000-0000-0000000000bb'),
  0::bigint,
  'linha do guest sumiu'
);

-- =========================================================
-- insert bloqueado em sala encerrada
-- =========================================================
update public.rooms set ended_at = now() where code = 'TEST02';

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000bb","role":"authenticated"}', true);

select throws_ok(
  $$insert into public.room_participants (room_id, user_id, display_name)
    values ((select id from public.rooms where code = 'TEST02'),
            '00000000-0000-0000-0000-0000000000bb', 'Late')$$,
  '42501', null,
  'não entra em sala encerrada'
);

select * from finish();
rollback;
