-- Karaokê Live — nome obrigatório + geolocalização da sala
-- Ao criar uma sala, o host agora dá um nome (1–80 chars) e fornece lat/lng.
-- Salas antigas (testes internos) são backfillladas com nome 'Sala' e (0, 0).

-- =========================================================
-- name: backfill + NOT NULL + check de comprimento
-- =========================================================
update public.rooms set name = 'Sala' where name is null;

alter table public.rooms
  alter column name set not null,
  add constraint rooms_name_length_check
    check (char_length(trim(name)) between 1 and 80);

-- =========================================================
-- latitude / longitude (double precision, NOT NULL + checks de faixa)
-- =========================================================
alter table public.rooms
  add column latitude double precision,
  add column longitude double precision;

update public.rooms set latitude = 0, longitude = 0;

alter table public.rooms
  alter column latitude set not null,
  alter column longitude set not null,
  add constraint rooms_latitude_range_check
    check (latitude between -90 and 90),
  add constraint rooms_longitude_range_check
    check (longitude between -180 and 180);
