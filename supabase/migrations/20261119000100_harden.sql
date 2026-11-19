-- Fixes from the Supabase security advisor, plus a gap found in review.

-- 1. Role helpers were callable as /rest/v1/rpc/*. Move them to a schema the API does not expose.
--    Policies reference functions by OID, so they keep working.
create schema if not exists private;
grant usage on schema private to anon, authenticated;
alter function public.my_role() set schema private;
alter function public.is_admin() set schema private;
alter function public.is_staff_or_admin() set schema private;
alter function public.handle_new_user() set schema private;
revoke execute on function private.handle_new_user() from public, anon, authenticated;

-- 2. Crew could change route_id on their own trip and then broadcast on another route.
--    Signed-in users may update only the live-state columns of a trip.
revoke update on public.trips from anon, authenticated;
grant update (status, seats_taken, seat_status, last_geom, last_speed_kmh, last_seen_at, ended_at)
  on public.trips to authenticated;

-- 3. Indexes for the trip lookups every screen makes.
create index if not exists trips_route_active on public.trips (route_id) where status = 'active';
create index if not exists trips_crew on public.trips (crew_id);
