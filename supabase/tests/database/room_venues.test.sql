begin;
select plan(5);

insert into auth.users (id, email)
values ('00000000-0000-0000-0000-0000000000e1', 'venue-host@test.local');

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000e1","role":"authenticated"}', true);
set local role authenticated;

select lives_ok(
  $$insert into public.rooms (code, name, host_id, latitude, longitude)
    values ('VEN001', 'Cliente anterior', auth.uid(), -8.05, -34.9)$$,
  'criação anterior continua funcionando');

select lives_ok(
  $$insert into public.rooms (code, name, host_id, venue_name)
    values ('VEN002', 'Sala manual', auth.uid(), 'Bar do Recife')$$,
  'aceita local manual sem GPS');

select lives_ok(
  $$insert into public.rooms (code, name, host_id, google_place_id)
    values ('VEN003', 'Sala Google', auth.uid(), 'place-id-example')$$,
  'aceita um local Google sem copiar coordenadas do Google');

select throws_ok(
  $$insert into public.rooms (code, name, host_id, latitude)
    values ('VEN004', 'GPS incompleto', auth.uid(), -8.05)$$,
  '23514', null, 'rejeita um par de coordenadas incompleto');

select throws_ok(
  $$insert into public.rooms (code, name, host_id, venue_name)
    values ('VEN005', 'Local em branco', auth.uid(), '   ')$$,
  '23514', null, 'rejeita nome de local em branco');

select * from finish();
rollback;
