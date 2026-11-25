begin;
select plan(6);

-- 1. Tabelas existem
select has_table('public', 'venues', 'venues table exists');
select has_table('public', 'venue_schedules', 'venue_schedules table exists');

-- 2. Coluna venue_id em rooms existe
select has_column('public', 'rooms', 'venue_id', 'rooms.venue_id exists');

-- 3. Constraints em venue_schedules
select col_is_pk('public', 'venues', 'id', 'venues.id is pk');
select col_is_pk('public', 'venue_schedules', 'id', 'venue_schedules.id is pk');

-- 4. Função open_venue_session existe
select has_function('public', 'open_venue_session', array['uuid', 'text', 'boolean', 'timestamptz', 'timestamptz'], 'open_venue_session RPC exists');

select * from finish();
rollback;
