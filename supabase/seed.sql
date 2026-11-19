-- Pilot routes from the Final System Specification.
-- Route lines (geom) come from the Sprint 1 ride-along GPX files; routes stay inactive until a line is uploaded.
insert into public.routes (code, name, origin, destination, vehicle_type) values
  ('TAG-PAN', 'Tagbilaran to Panglao', 'Tagbilaran City', 'Panglao', 'van'),
  ('DAO-NOR', 'Dao to Tubigon or Talibon', 'Dao Integrated Bus Terminal', 'Tubigon or Talibon', 'bus'),
  ('DAO-CAR', 'Dao to Carmen via Loboc and Bilar', 'Dao Integrated Bus Terminal', 'Carmen', 'bus'),
  ('DAO-UBA', 'Dao to Ubay via Jagna and Alicia', 'Dao Integrated Bus Terminal', 'Ubay', 'bus');

-- Hub location is set from the ride-along GPS (no guessed coordinates here).
insert into public.hubs (name) values ('Dao Integrated Bus Terminal');

-- fare_rules is left empty until the official Tagbilaran fare matrix is obtained.
