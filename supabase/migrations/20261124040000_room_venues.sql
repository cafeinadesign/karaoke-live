alter table public.rooms
  add column venue_name text,
  add column google_place_id text,
  alter column latitude drop not null,
  alter column longitude drop not null,
  add constraint rooms_coordinates_pair_check
    check ((latitude is null) = (longitude is null)),
  add constraint rooms_venue_name_length_check
    check (char_length(trim(venue_name)) between 1 and 160),
  add constraint rooms_google_place_id_not_blank_check
    check (char_length(trim(google_place_id)) > 0);
