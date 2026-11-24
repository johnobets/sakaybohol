-- Waiting passenger signal (feature 16) and rider "Full" report (feature 18).

-- Three rider "Full" reports on one trip within 10 minutes mark it full (spec, Core Logic 2).
-- security definer: riders may not update trips themselves.
create function private.apply_full_reports() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.rider_full_reports
      where trip_id = new.trip_id and created_at > now() - interval '10 minutes') >= 3 then
    update public.trips set seat_status = 'full' where id = new.trip_id and status = 'active';
  end if;
  return new;
end;
$$;
revoke execute on function private.apply_full_reports() from public, anon, authenticated;
create trigger rider_full_reports_apply after insert on public.rider_full_reports
  for each row execute function private.apply_full_reports();

-- Riders may report only active trips.
drop policy "report full" on public.rider_full_reports;
create policy "report full" on public.rider_full_reports for insert to authenticated
  with check (user_id = (select auth.uid()) and exists (select 1 from public.trips t where t.id = trip_id and t.status = 'active'));

-- People waiting ahead of a crew's van on its route, in its direction of travel, within p_km.
create function public.waiting_ahead(p_trip uuid, p_km double precision default 10)
returns table (waiting int, nearest_m numeric)
language sql stable security invoker set search_path = '' as $$
  with t as (
    select tr.direction, r.geom::extensions.geometry as line, tr.last_geom::extensions.geometry as van
    from public.trips tr join public.routes r on r.id = tr.route_id
    where tr.id = p_trip and tr.status = 'active' and tr.last_geom is not null
  ),
  w as (
    select extensions.st_linelocatepoint(t.line, ws.geom::extensions.geometry) as f_w,
           extensions.st_linelocatepoint(t.line, t.van) as f_v,
           t.line, t.direction
    from t join public.waiting_signals ws on ws.expires_at > now()
      and ws.route_id = (select route_id from public.trips where id = p_trip)
  ),
  ahead as (
    select extensions.st_length(extensions.st_linesubstring(line, least(f_v, f_w), greatest(f_v, f_w))::extensions.geography) as d
    from w
    where (direction = 'outbound' and f_w >= f_v) or (direction = 'inbound' and f_w <= f_v)
  )
  select count(*)::int, round(min(d)::numeric) from ahead where d <= p_km * 1000;
$$;
grant execute on function public.waiting_ahead(uuid, double precision) to authenticated;
