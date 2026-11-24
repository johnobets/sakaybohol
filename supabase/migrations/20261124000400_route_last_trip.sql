-- Expose each route's last trip time to the apps (set by admins on the Routes page).
create or replace view public.route_lines with (security_invoker = true) as
  select id, code, name, origin, destination, vehicle_type,
         round(length_m / 1000, 1) as length_km,
         extensions.st_asgeojson(geom)::json as geojson,
         last_trip_time
  from public.routes
  where geom is not null;
