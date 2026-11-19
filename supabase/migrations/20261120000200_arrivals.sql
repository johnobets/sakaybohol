-- Arrival estimate (spec, Core Logic 1):
--   ETA = distance along the route from the van to the commuter's pickup point / the van's recent speed.
-- The pickup point is the nearest point on the route line, since buses and vans stop anywhere.

-- Average speed over the last 5 minutes. Commuters may not read raw GPS history (RLS), so this
-- private helper returns only the average. The private schema is not exposed through the API.
create function private.recent_speed_kmh(p_trip uuid) returns numeric
language sql stable security definer set search_path = '' as $$
  select avg(speed_kmh) from public.positions
  where trip_id = p_trip and recorded_at > now() - interval '5 minutes' and speed_kmh is not null
$$;
revoke execute on function private.recent_speed_kmh(uuid) from public;
grant execute on function private.recent_speed_kmh(uuid) to anon, authenticated;

-- Vans coming toward the given spot, nearest first. Runs as the caller, so RLS still applies.
-- Speed: 5-minute average, else the last reported speed; 30 km/h when nothing is known;
-- never below 10 km/h so a van stopped to load does not show an endless ETA.
-- ponytail: no traffic or stop model yet; segment_speeds (Sprint 6) can replace the 30 km/h default.
create function public.arrivals_near(p_lat double precision, p_lng double precision, p_radius_m double precision default 1000)
returns table (
  trip_id uuid, route_id uuid, route_code text, route_name text, origin text, destination text,
  plate_no text, vehicle_type public.vehicle_type, direction public.trip_direction,
  seats_left int, seat_status public.seat_status,
  walk_m numeric, distance_m numeric, speed_kmh numeric, eta_min numeric, pickup json, last_seen_at timestamptz
)
language sql stable security invoker set search_path = '' as $$
  with me as (
    select extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326) as g
  ),
  near as (
    select r.id, r.code, r.name, r.origin, r.destination,
           r.geom::extensions.geometry as line,
           extensions.st_linelocatepoint(r.geom::extensions.geometry, me.g) as f_user,
           extensions.st_distance(r.geom, me.g::extensions.geography) as walk
    from public.routes r, me
    where r.active and r.geom is not null
      and extensions.st_dwithin(r.geom, me.g::extensions.geography, p_radius_m)
  ),
  vans as (
    select n.*, t.id as trip, t.direction as dir, t.seat_status as seats_state, t.last_seen_at as seen,
           greatest(v.capacity - t.seats_taken, 0) as left_seats, v.plate_no as plate, v.type as vtype,
           extensions.st_linelocatepoint(n.line, t.last_geom::extensions.geometry) as f_van,
           coalesce(private.recent_speed_kmh(t.id), t.last_speed_kmh) as raw_speed
    from near n
    join public.trips t on t.route_id = n.id and t.status = 'active'
                       and t.last_geom is not null and t.last_seen_at > now() - interval '5 minutes'
    join public.vehicles v on v.id = t.vehicle_id
  ),
  ahead as (
    -- Only vans that have not passed the commuter yet in their direction of travel.
    select vans.*,
           extensions.st_length(
             extensions.st_linesubstring(line, least(f_user, f_van), greatest(f_user, f_van))::extensions.geography
           ) as d,
           case when raw_speed is null then 30 else greatest(raw_speed, 10) end as s
    from vans
    where (dir = 'outbound' and f_van <= f_user) or (dir = 'inbound' and f_van >= f_user)
  )
  select trip, id, code, name, origin, destination, plate, vtype, dir, left_seats, seats_state,
         round(walk::numeric), round(d::numeric), round(s::numeric, 1),
         round((d / 1000 / s * 60)::numeric, 1),
         extensions.st_asgeojson(extensions.st_lineinterpolatepoint(line, f_user))::json,
         seen
  from ahead
  order by 15;
$$;
grant execute on function public.arrivals_near(double precision, double precision, double precision) to anon, authenticated;
