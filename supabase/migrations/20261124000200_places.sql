-- Towns commuters can pick as a trip-planner destination. Filled by tools/route-builder/build-places.mjs.
create table public.places (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  geom extensions.geography(Point, 4326) not null
);
alter table public.places enable row level security;
create policy "read places" on public.places for select to anon, authenticated using (true);
create policy "admin writes places" on public.places for all to authenticated using (private.is_admin()) with check (private.is_admin());

-- Only towns within 2 km of an active route, nearest route first, as the planner can reach them.
create view public.places_served with (security_invoker = true) as
  select p.id, p.name,
         extensions.st_y(p.geom::extensions.geometry) as lat,
         extensions.st_x(p.geom::extensions.geometry) as lng,
         round(min(extensions.st_distance(p.geom, r.geom))::numeric) as to_route_m
  from public.places p
  join public.routes r on r.active and r.geom is not null and extensions.st_dwithin(p.geom, r.geom, 2000)
  group by p.id, p.name, p.geom;
grant select on public.places_served to anon, authenticated;
