-- Tricycle fare calculator (feature 19) and overcharge complaints (feature 20).

-- ponytail: placeholder rule until the admin enters the city ordinance on the Fares page.
insert into public.fare_rules (lgu, base_fare, base_km, per_km, effective_date)
values ('Tagbilaran City', 15, 2, 2, '2026-01-01');

-- Fare for a trip between two points under the newest rule in effect.
-- ponytail: straight-line distance x 1.3 stands in for road distance; use the road network if complaints dispute it.
create function public.fare_estimate(o_lat double precision, o_lng double precision, d_lat double precision, d_lng double precision,
                                     p_lgu text default 'Tagbilaran City')
returns table (km numeric, fare numeric, base_fare numeric, base_km numeric, per_km numeric, effective_date date)
language sql stable security invoker set search_path = '' as $$
  with r as (
    select * from public.fare_rules
    where lgu = p_lgu and effective_date <= current_date
    order by effective_date desc limit 1
  ),
  d as (
    select round((extensions.st_distance(
      extensions.st_setsrid(extensions.st_makepoint(o_lng, o_lat), 4326)::extensions.geography,
      extensions.st_setsrid(extensions.st_makepoint(d_lng, d_lat), 4326)::extensions.geography) * 1.3 / 1000)::numeric, 1) as km
  )
  select d.km, ceil(r.base_fare + greatest(0, d.km - r.base_km) * r.per_km), r.base_fare, r.base_km, r.per_km, r.effective_date
  from r, d;
$$;
grant execute on function public.fare_estimate(double precision, double precision, double precision, double precision, text) to anon, authenticated;

-- The expected fare on a complaint is computed here, never taken from the app.
create function private.fill_expected_fare() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  select e.fare into new.expected
  from public.fare_estimate(
    extensions.st_y(new.from_geom::extensions.geometry), extensions.st_x(new.from_geom::extensions.geometry),
    extensions.st_y(new.to_geom::extensions.geometry), extensions.st_x(new.to_geom::extensions.geometry)) e;
  return new;
end;
$$;
revoke execute on function private.fill_expected_fare() from public, anon, authenticated;
create trigger fare_complaints_expected before insert on public.fare_complaints
  for each row execute function private.fill_expected_fare();

-- Staff see complaints too (read only); admins still decide.
drop policy "own fare complaints" on public.fare_complaints;
create policy "own fare complaints" on public.fare_complaints for select to authenticated
  using (reporter_id = (select auth.uid()) or private.is_staff_or_admin());

create view public.fare_complaint_list with (security_invoker = true) as
  select id, charged, expected, tricycle_no, status, created_at,
         extensions.st_asgeojson(from_geom)::json as from_geojson,
         extensions.st_asgeojson(to_geom)::json as to_geojson
  from public.fare_complaints;
