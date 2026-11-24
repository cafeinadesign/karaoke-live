begin;
select plan(12);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'membership-host@test.local'),
  ('00000000-0000-0000-0000-0000000000b2', 'membership-guest@test.local'),
  ('00000000-0000-0000-0000-0000000000c3', 'membership-other@test.local');

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
set local role authenticated;

insert into public.rooms (id, code, name, host_id, latitude, longitude) values
  ('00000000-0000-0000-0000-0000000000d4', 'MEM123', 'Sala de teste',
   '00000000-0000-0000-0000-0000000000a1', 0, 0);

select is((select count(*) from public.room_memberships where left_at is null), 1::bigint,
  'a sala aparece para o host desde a criação');

select throws_ok(
  $$select public.transfer_room_host(
    '00000000-0000-0000-0000-0000000000d4', '00000000-0000-0000-0000-0000000000c3')$$,
  '42501', 'invalid_host_transfer', 'o host só pode transferir para quem está na sala');

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated"}', true);

select is((select count(*) from public.room_memberships), 0::bigint,
  'quem ainda não entrou não vê a participação de outra conta');

insert into public.room_participants (room_id, user_id, display_name)
values ('00000000-0000-0000-0000-0000000000d4', auth.uid(), 'Convidado');

select is((select count(*) from public.room_memberships where left_at is null), 1::bigint,
  'o join registra uma participação ativa para o convidado');

delete from public.room_participants where
  room_id = '00000000-0000-0000-0000-0000000000d4' and user_id = auth.uid();

select is((select count(*) from public.room_memberships where left_at is null), 1::bigint,
  'a participação continua ativa quando a presença expira');

select public.leave_room_membership('00000000-0000-0000-0000-0000000000d4');

select is((select count(*) from public.room_memberships where left_at is not null), 1::bigint,
  'a saída explícita guarda o histórico mesmo com presença expirada');

insert into public.room_participants (room_id, user_id, display_name)
values ('00000000-0000-0000-0000-0000000000d4', auth.uid(), 'Convidado')
on conflict (room_id, user_id) do update set display_name = excluded.display_name;

select is((select count(*) from public.room_memberships where left_at is null), 1::bigint,
  'voltar à sala reativa a participação sem duplicar o histórico');

select throws_ok(
  $$select public.transfer_room_host(
    '00000000-0000-0000-0000-0000000000d4', auth.uid(), true)$$,
  '42501', 'invalid_host_transfer', 'o convidado não pode tomar o comando');

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);

insert into public.room_participants (room_id, user_id, display_name)
values ('00000000-0000-0000-0000-0000000000d4', auth.uid(), 'Anfitrião');

select is(
  (public.transfer_room_host(
    '00000000-0000-0000-0000-0000000000d4', '00000000-0000-0000-0000-0000000000b2', true)
  ).host_id,
  '00000000-0000-0000-0000-0000000000b2'::uuid,
  'o host pode passar o comando ao sair');

select is((select count(*) from public.room_memberships where left_at is not null), 1::bigint,
  'o antigo host fica no histórico após a saída');

select is((select count(*) from public.room_participants where user_id = auth.uid()), 0::bigint,
  'a saída explícita remove também a presença');

select is((select count(*) from public.rooms where code = 'MEM123' and ended_at is null), 1::bigint,
  'a transferência mantém a sala aberta');

select * from finish();
rollback;
