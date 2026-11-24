-- Traffic analytics for the admin dashboard (feature 21), last p_days days, Philippine time.
-- security invoker + the staff check: RLS already limits ended trips and all incidents to staff/admin.
create function public.traffic_analytics(p_days int default 30) returns json
language plpgsql stable security invoker set search_path = '' as $$
declare
  since timestamptz := now() - make_interval(days => p_days);
  result json;
begin
  if not private.is_staff_or_admin() then
    raise exception 'staff or admin only' using errcode = '42501';
  end if;

  with t as (
    select tr.*, r.code, r.name,
           extract(epoch from (tr.ended_at - tr.started_at)) / 60 as minutes,
           extract(hour from tr.started_at at time zone 'Asia/Manila')::int as hour
    from public.trips tr join public.routes r on r.id = tr.route_id
    where tr.started_at >= since
  ),
  slow as (
    -- ponytail: ~100 m grid cells (3 decimals); a congestion cell = GPS fixes under 10 km/h, ignoring the first/last 2 min at terminals.
    select round(extensions.st_y(p.geom::extensions.geometry)::numeric, 3) as lat,
           round(extensions.st_x(p.geom::extensions.geometry)::numeric, 3) as lng,
           count(*) as fixes
    from public.positions p join public.trips tr on tr.id = p.trip_id
    where p.recorded_at >= since and p.speed_kmh < 10
      and p.recorded_at > tr.started_at + interval '2 minutes'
      and (tr.ended_at is null or p.recorded_at < tr.ended_at - interval '2 minutes')
    group by 1, 2
  ),
  hz as (
    select round(extensions.st_y(geom::extensions.geometry)::numeric, 3) as lat,
           round(extensions.st_x(geom::extensions.geometry)::numeric, 3) as lng,
           count(*) as reports,
           string_agg(distinct type::text, ', ') as types
    from public.incidents
    where created_at >= since and status in ('approved', 'resolved')
    group by 1, 2
  )
  select json_build_object(
    'days', p_days,
    'trips', (select count(*) from t),
    'completed', (select count(*) from t where status = 'ended'),
    'avg_minutes', (select round(avg(minutes)::numeric) from t where status = 'ended'),
    'incidents', (select count(*) from public.incidents where created_at >= since),
    'complaints', (select count(*) from public.fare_complaints where created_at >= since),
    'by_hour', (select json_agg(json_build_object('hour', h, 'trips', (select count(*) from t where t.hour = h)) order by h)
                from generate_series(0, 23) h),
    'by_route', (select coalesce(json_agg(x order by x.trips desc), '[]') from (
                  select code, name, count(*) as trips,
                         round(avg(minutes) filter (where status = 'ended')::numeric) as avg_minutes,
                         round((select avg(p.speed_kmh) from public.positions p
                                where p.trip_id = any(array_agg(t.id)) and p.speed_kmh > 0)::numeric, 1) as avg_kmh
                  from t group by code, name) x),
    'by_type', (select coalesce(json_agg(x order by x.reports desc), '[]') from (
                  select type, count(*) as reports from public.incidents where created_at >= since group by type) x),
    'congestion', (select coalesce(json_agg(x), '[]') from (select * from slow order by fixes desc limit 10) x),
    'hazard_spots', (select coalesce(json_agg(x), '[]') from (select * from hz order by reports desc limit 10) x)
  ) into result;
  return result;
end;
$$;
grant execute on function public.traffic_analytics(int) to authenticated;
