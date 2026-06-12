-- pgTAP: RPCs da fila — enqueue_item (limite de 1), advance_queue,
-- reorder_queue, replace_queue_item_video.
-- auth.uid() é simulado via request.jwt.claims + role authenticated,
-- exatamente como o PostgREST faz em produção.

begin;
select plan(17);

-- =========================================================
-- Seed (como postgres): 3 usuários → trigger cria profiles
-- =========================================================
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'host@test.local'),
  ('00000000-0000-0000-0000-00000000000b', 'guest-b@test.local'),
  ('00000000-0000-0000-0000-00000000000c', 'guest-c@test.local');

-- Host A cria a sala (como authenticated, RLS valendo)
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
set local role authenticated;

insert into public.rooms (code, host_id, name, latitude, longitude)
values ('TEST01', '00000000-0000-0000-0000-00000000000a', 'Sala pgTAP', -8.05, -34.9);

-- =========================================================
-- enqueue_item: convidado B enfileira; limite de 1 ativa
-- =========================================================
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);

select lives_ok(
  $$select public.enqueue_item(
      (select id from public.rooms where code = 'TEST01'),
      'vid-b1', 'Música do B', null, 180)$$,
  'B enfileira a primeira música'
);

select is(
  (select position from public.queue_items where video_id = 'vid-b1'),
  1,
  'primeira música entra na position 1'
);

select throws_ok(
  $$select public.enqueue_item(
      (select id from public.rooms where code = 'TEST01'),
      'vid-b2', 'Segunda do B', null, 200)$$,
  'user_already_has_active_item',
  'B não pode enfileirar com música pending'
);

-- C enfileira normalmente
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000000c","role":"authenticated"}', true);

select lives_ok(
  $$select public.enqueue_item(
      (select id from public.rooms where code = 'TEST01'),
      'vid-c1', 'Música do C', null, 240)$$,
  'C enfileira a dele'
);

-- =========================================================
-- advance_queue: só host avança
-- =========================================================
select throws_ok(
  $$select public.advance_queue((select id from public.rooms where code = 'TEST01'))$$,
  'not_host',
  'convidado não avança a fila'
);

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);

select lives_ok(
  $$select public.advance_queue((select id from public.rooms where code = 'TEST01'))$$,
  'host avança a fila'
);

select is(
  (select status from public.queue_items where video_id = 'vid-b1'),
  'now_playing',
  'música do B (menor position) virou now_playing'
);

-- B segue travado enquanto canta (now_playing também conta no limite)
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);

select throws_ok(
  $$select public.enqueue_item(
      (select id from public.rooms where code = 'TEST01'),
      'vid-b3', 'Terceira do B', null, 150)$$,
  'user_already_has_active_item',
  'B não enfileira enquanto canta'
);

-- =========================================================
-- reorder_queue: só host; reatribui positions na nova ordem
-- =========================================================
-- Host A enfileira também (3º item, position 3)
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);

select lives_ok(
  $$select public.enqueue_item(
      (select id from public.rooms where code = 'TEST01'),
      'vid-a1', 'Música do A', null, 210)$$,
  'host também enfileira como participante'
);

-- não-host tenta reordenar
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000000c","role":"authenticated"}', true);

select throws_ok(
  $$select public.reorder_queue(
      (select id from public.rooms where code = 'TEST01'),
      array[
        (select id from public.queue_items where video_id = 'vid-a1'),
        (select id from public.queue_items where video_id = 'vid-c1')
      ])$$,
  'not_host',
  'convidado não reordena'
);

-- host inverte [C, A] → [A, C]
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);

select lives_ok(
  $$select public.reorder_queue(
      (select id from public.rooms where code = 'TEST01'),
      array[
        (select id from public.queue_items where video_id = 'vid-a1'),
        (select id from public.queue_items where video_id = 'vid-c1')
      ])$$,
  'host reordena os pending'
);

select is(
  (select position from public.queue_items where video_id = 'vid-a1'),
  2,
  'A assumiu a position 2'
);

select is(
  (select position from public.queue_items where video_id = 'vid-c1'),
  3,
  'C foi pra position 3'
);

-- =========================================================
-- replace_queue_item_video: só o dono, só pending
-- =========================================================
-- C tenta trocar a música do A
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000000c","role":"authenticated"}', true);

select throws_ok(
  $$select public.replace_queue_item_video(
      (select id from public.queue_items where video_id = 'vid-a1'),
      'vid-hack', 'Hack', null, 100)$$,
  'not_owner_or_not_pending',
  'não-dono não troca a música'
);

-- A troca a própria música pendente
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);

select lives_ok(
  $$select public.replace_queue_item_video(
      (select id from public.queue_items where video_id = 'vid-a1'),
      'vid-a2', 'Nova do A', null, 195)$$,
  'dono troca a própria música pendente'
);

select is(
  (select position from public.queue_items where video_id = 'vid-a2'),
  2,
  'troca mantém a position (não perde a vez)'
);

-- B tenta trocar a própria, mas ela está now_playing
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);

select throws_ok(
  $$select public.replace_queue_item_video(
      (select id from public.queue_items where video_id = 'vid-b1'),
      'vid-b9', 'Tarde demais', null, 100)$$,
  'not_owner_or_not_pending',
  'não troca música que já está tocando'
);

select * from finish();
rollback;
