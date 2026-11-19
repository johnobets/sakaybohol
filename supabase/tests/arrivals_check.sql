-- Self-check for public.arrivals_near. Run in the Supabase SQL editor; it rolls everything back.
-- Every row in the result should say pass = true.
begin;

-- Test vans on Tagbilaran-Panglao at known fractions of the line (0 = Tagbilaran end, 1 = Panglao end).
create temp table k as
  select r.id as route_id, r.geom::extensions.geometry as line, r.length_m as len,
         (select id from public.profiles where role = 'crew' limit 1) as crew
  from public.routes r where r.code = 'TAG-PAN';

insert into public.vehicles (plate_no, type, capacity) values ('CHECK-1', 'van', 14), ('CHECK-2', 'van', 14), ('CHECK-3', 'van', 14), ('CHECK-4', 'van', 14);

insert into public.trips (route_id, vehicle_id, crew_id, direction, seats_taken, last_geom, last_speed_kmh, last_seen_at)
select k.route_id, v.id, k.crew, d.dir::public.trip_direction, 3,
       extensions.st_lineinterpolatepoint(k.line, d.f)::extensions.geography, d.speed, now() - d.age
from k
join (values
  ('CHECK-1', 'outbound', 0.10, 30, interval '0'),    -- behind the commuter, coming: ETA ~ 0.4 * 16.3 km / 30 km/h
  ('CHECK-2', 'inbound',  0.90, 30, interval '0'),    -- coming back from Panglao: same distance
  ('CHECK-3', 'outbound', 0.30,  0, interval '0'),    -- stopped to load: speed floored at 10 km/h
  ('CHECK-4', 'outbound', 0.20, 30, interval '10 minutes') -- stale: last seen 10 min ago, must be hidden
) as d(plate, dir, f, speed, age) on true
join public.vehicles v on v.plate_no = d.plate;

-- Commuter halfway along the route; looked up as a logged-out user so RLS applies.
create temp table spot as
  select extensions.st_y(p) as lat, extensions.st_x(p) as lng
  from (select extensions.st_lineinterpolatepoint(line, 0.5) as p from k) s;
create temp table behind as
  select extensions.st_y(p) as lat, extensions.st_x(p) as lng
  from (select extensions.st_lineinterpolatepoint(line, 0.02) as p from k) s;
grant select on spot, behind, k to anon;

set local role anon;
create temp table got as select a.* from spot, public.arrivals_near(spot.lat, spot.lng) a where a.plate_no like 'CHECK-%';
create temp table got_behind as select a.* from behind, public.arrivals_near(behind.lat, behind.lng) a where a.plate_no like 'CHECK-%';

select 'outbound van ~6.5 km away' as check, (select distance_m from got where plate_no = 'CHECK-1') as value,
       (select abs(distance_m - 0.4 * len) < 0.03 * len from got, k where plate_no = 'CHECK-1') as pass
union all
select 'outbound ETA ~13 min at 30 km/h', (select eta_min from got where plate_no = 'CHECK-1'),
       (select abs(eta_min - (0.4 * len / 1000 / 30 * 60)) < 0.5 from got, k where plate_no = 'CHECK-1')
union all
select 'inbound van coming back also listed', (select distance_m from got where plate_no = 'CHECK-2'),
       (select abs(distance_m - 0.4 * len) < 0.03 * len from got, k where plate_no = 'CHECK-2')
union all
select 'stopped van uses 10 km/h', (select speed_kmh from got where plate_no = 'CHECK-3'),
       (select speed_kmh = 10 from got where plate_no = 'CHECK-3')
union all
select 'stale van hidden', (select count(*) from got where plate_no = 'CHECK-4'),
       (select count(*) = 0 from got where plate_no = 'CHECK-4')
union all
select 'nearest first', null, (select bool_and(ok) from (select eta_min >= lag(eta_min, 1, 0::numeric) over (order by eta_min) as ok from got) x)
union all
select 'passed outbound vans hidden near Tagbilaran end', (select count(*) from got_behind where direction = 'outbound'),
       (select count(*) = 0 from got_behind where direction = 'outbound')
union all
select 'pickup point is on the route', (select walk_m from got where plate_no = 'CHECK-1'),
       (select walk_m < 5 from got where plate_no = 'CHECK-1');

rollback;
