-- Trip planner (spec feature 9): fastest public transport from A to B, direct or with one transfer.
-- Times: riding at 30 km/h, walking 80 m/min, a tricycle hop at 20 km/h + 5 min to find one.
-- First-leg wait uses the live ETA from arrivals_near when a van is coming; otherwise 15 min is assumed,
-- as is the wait for the second leg. ponytail: fixed speeds until segment_speeds has real data.
create or replace function public.plan_trip(
  o_lat double precision, o_lng double precision,
  d_lat double precision, d_lng double precision,
  p_walk_m double precision default 1000
)
returns table (total_min numeric, wait_min numeric, wait_is_live boolean, transfers int, legs json)
language sql stable security invoker set search_path = '' as $$
  with pts as (
    select extensions.st_setsrid(extensions.st_makepoint(o_lng, o_lat), 4326) as o,
           extensions.st_setsrid(extensions.st_makepoint(d_lng, d_lat), 4326) as d
  ),
  r as (
    select id, code, name, origin, destination, geom as g, geom::extensions.geometry as line
    from public.routes where active and geom is not null
  ),
  near_o as (
    select r.*, extensions.st_linelocatepoint(r.line, pts.o) as f, extensions.st_distance(r.g, pts.o::extensions.geography) as walk
    from r, pts where extensions.st_dwithin(r.g, pts.o::extensions.geography, p_walk_m)
  ),
  near_d as (
    select r.*, extensions.st_linelocatepoint(r.line, pts.d) as f, extensions.st_distance(r.g, pts.d::extensions.geography) as walk
    from r, pts where extensions.st_dwithin(r.g, pts.d::extensions.geography, p_walk_m)
  ),
  live as (
    select a.route_id, a.direction::text as dir, min(a.eta_min) as eta
    from public.arrivals_near(o_lat, o_lng, p_walk_m) a group by 1, 2
  ),
  -- One leg: ride a route from fraction f1 to f2.
  direct as (
    select o.id, o.code, o.name, o.origin, o.destination, o.line, o.f as f1, d.f as f2, o.walk as w1, d.walk as w2,
           case when d.f > o.f then 'outbound' else 'inbound' end as dir
    from near_o o join near_d d on d.id = o.id
    where abs(d.f - o.f) > 0.002
  ),
  direct_opt as (
    select x.*,
           extensions.st_length(extensions.st_linesubstring(x.line, least(x.f1, x.f2), greatest(x.f1, x.f2))::extensions.geography) as ride_m,
           l.eta
    from direct x left join live l on l.route_id = x.id and l.dir = x.dir
  ),
  -- Two legs: route A near the start, route B near the end.
  -- Where to change: if the two routes share road (e.g. Dao to Loay), change on the shared stretch
  -- at the point nearest the start; otherwise where the two lines come closest.
  pair as (
    select a.id a_id, a.code a_code, a.name a_name, a.origin a_origin, a.destination a_dest, a.line a_line, a.f a_f1, a.walk w1,
           b.id b_id, b.code b_code, b.name b_name, b.origin b_origin, b.destination b_dest, b.line b_line, b.f b_f2, b.walk w2,
           extensions.st_intersection(a.line, extensions.st_buffer(b.line, 0.0005)) as shared,
           pts.o
    from near_o a join near_d b on b.id <> a.id, pts
    where extensions.st_dwithin(a.g, b.g, 4000)
  ),
  pair1 as (
    select p.*,
           case when extensions.st_isempty(p.shared) then extensions.st_closestpoint(p.a_line, p.b_line)
                else extensions.st_closestpoint(p.shared, p.o) end as xa
    from pair p
  ),
  pair2 as (
    select p.*,
           extensions.st_closestpoint(p.b_line, p.xa) as xb,
           extensions.st_linelocatepoint(p.a_line, p.xa) as a_fx,
           extensions.st_linelocatepoint(p.b_line, extensions.st_closestpoint(p.b_line, p.xa)) as b_fx,
           extensions.st_distance(p.xa::extensions.geography, extensions.st_closestpoint(p.b_line, p.xa)::extensions.geography) as gap_m
    from pair1 p
  ),
  xfer_opt as (
    select p.*,
           case when p.a_fx > p.a_f1 then 'outbound' else 'inbound' end as a_dir,
           case when p.b_f2 > p.b_fx then 'outbound' else 'inbound' end as b_dir,
           extensions.st_length(extensions.st_linesubstring(p.a_line, least(p.a_f1, p.a_fx), greatest(p.a_f1, p.a_fx))::extensions.geography) as a_m,
           extensions.st_length(extensions.st_linesubstring(p.b_line, least(p.b_fx, p.b_f2), greatest(p.b_fx, p.b_f2))::extensions.geography) as b_m
    from pair2 p
    where abs(p.a_fx - p.a_f1) > 0.002 and abs(p.b_f2 - p.b_fx) > 0.002
  ),
  options as (
    select coalesce(x.eta, 15) as wait, x.eta is not null as live, 0 as transfers,
           x.w1 / 80 + coalesce(x.eta, 15) + x.ride_m / 500 + x.w2 / 80 as total,
           json_build_array(json_build_object(
             'kind', 'ride', 'route_code', x.code, 'route_name', x.name,
             'towards', case when x.dir = 'outbound' then x.destination else x.origin end,
             'walk_to_m', round(x.w1::numeric), 'ride_km', round((x.ride_m / 1000)::numeric, 1),
             'board', extensions.st_asgeojson(extensions.st_lineinterpolatepoint(x.line, x.f1))::json,
             'alight', extensions.st_asgeojson(extensions.st_lineinterpolatepoint(x.line, x.f2))::json,
             'walk_after_m', round(x.w2::numeric)
           )) as legs
    from direct_opt x
    union all
    select coalesce(l.eta, 15), l.eta is not null, 1,
           x.w1 / 80 + coalesce(l.eta, 15) + x.a_m / 500
             + case when x.gap_m <= 800 then x.gap_m / 80 else x.gap_m / 1000 / 20 * 60 + 5 end
             + 15 + x.b_m / 500 + x.w2 / 80,
           json_build_array(
             json_build_object('kind', 'ride', 'route_code', x.a_code, 'route_name', x.a_name,
               'towards', case when x.a_dir = 'outbound' then x.a_dest else x.a_origin end,
               'walk_to_m', round(x.w1::numeric), 'ride_km', round((x.a_m / 1000)::numeric, 1),
               'board', extensions.st_asgeojson(extensions.st_lineinterpolatepoint(x.a_line, x.a_f1))::json,
               'alight', extensions.st_asgeojson(x.xa)::json),
             json_build_object('kind', case when x.gap_m <= 800 then 'walk' else 'tricycle' end,
               'distance_m', round(x.gap_m::numeric)),
             json_build_object('kind', 'ride', 'route_code', x.b_code, 'route_name', x.b_name,
               'towards', case when x.b_dir = 'outbound' then x.b_dest else x.b_origin end,
               'ride_km', round((x.b_m / 1000)::numeric, 1),
               'board', extensions.st_asgeojson(x.xb)::json,
               'alight', extensions.st_asgeojson(extensions.st_lineinterpolatepoint(x.b_line, x.b_f2))::json,
               'walk_after_m', round(x.w2::numeric))
           )
    from xfer_opt x left join live l on l.route_id = x.a_id and l.dir = x.a_dir
  )
  select round(total::numeric), round(wait::numeric, 1), live, transfers, legs
  from options
  order by total
  limit 5;
$$;
grant execute on function public.plan_trip(double precision, double precision, double precision, double precision, double precision) to anon, authenticated;
