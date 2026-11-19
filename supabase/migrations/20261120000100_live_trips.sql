-- Last known position of every active trip, so a commuter map can draw vans the moment it opens,
-- before the next Realtime broadcast arrives. Caller's RLS applies (security_invoker).
create view public.live_trips with (security_invoker = true) as
  select t.id as trip_id,
         t.route_id,
         r.code as route_code,
         t.direction,
         t.seat_status,
         greatest(v.capacity - t.seats_taken, 0) as seats_left,
         v.plate_no,
         v.type as vehicle_type,
         extensions.st_asgeojson(t.last_geom)::json as geojson,
         t.last_speed_kmh,
         t.last_seen_at
  from public.trips t
  join public.vehicles v on v.id = t.vehicle_id
  join public.routes r on r.id = t.route_id
  where t.status = 'active' and t.last_geom is not null;

grant select on public.live_trips to anon, authenticated;
