-- Map-ready views: route lines and hubs as GeoJSON, so apps don't have to decode PostGIS types.
-- security_invoker = true means the caller's RLS applies (logged-out users see only active routes).

create view public.route_lines with (security_invoker = true) as
  select id, code, name, origin, destination, vehicle_type,
         round(length_m / 1000, 1) as length_km,
         extensions.st_asgeojson(geom)::json as geojson
  from public.routes
  where geom is not null;

create view public.hub_points with (security_invoker = true) as
  select id, name, extensions.st_asgeojson(geom)::json as geojson
  from public.hubs
  where geom is not null;

grant select on public.route_lines, public.hub_points to anon, authenticated;
