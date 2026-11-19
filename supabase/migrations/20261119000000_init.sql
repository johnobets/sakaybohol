-- SakayBohol initial schema. Matches "Database Schema" in the Final System Specification.
-- All locations are geography(…, 4326). Row Level Security is on for every table.

create extension if not exists postgis with schema extensions;

-- ---------- types ----------
create type public.user_role as enum ('commuter', 'crew', 'staff', 'admin');
create type public.vehicle_type as enum ('bus', 'van');
create type public.trip_direction as enum ('outbound', 'inbound');
create type public.trip_status as enum ('active', 'ended');
create type public.seat_status as enum ('available', 'almost_full', 'full', 'unknown');
create type public.incident_type as enum ('flood', 'landslide', 'accident', 'roadwork', 'other');
create type public.review_status as enum ('pending', 'approved', 'rejected', 'resolved');

-- ---------- tables ----------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role public.user_role not null default 'commuter',
  full_name text,
  phone text,
  created_at timestamptz not null default now()
);

create table public.routes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  origin text not null,
  destination text not null,
  vehicle_type public.vehicle_type not null,
  geom extensions.geography(LineString, 4326),          -- uploaded from ride-along GPX/GeoJSON
  length_m numeric generated always as (extensions.st_length(geom)) stored,
  last_trip_time time,
  active boolean not null default false
);

create table public.hubs (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  geom extensions.geography(Point, 4326)
);

create table public.vehicles (
  id uuid primary key default gen_random_uuid(),
  plate_no text not null unique,
  type public.vehicle_type not null,
  capacity int not null check (capacity > 0),
  operator_name text,
  assigned_crew_id uuid references public.profiles (id) on delete set null,
  active boolean not null default true
);

create table public.trips (
  id uuid primary key default gen_random_uuid(),
  route_id uuid not null references public.routes (id),
  vehicle_id uuid not null references public.vehicles (id),
  crew_id uuid not null references public.profiles (id),
  direction public.trip_direction not null,
  status public.trip_status not null default 'active',
  seats_taken int not null default 0 check (seats_taken >= 0),
  seat_status public.seat_status not null default 'available',
  last_geom extensions.geography(Point, 4326),
  last_speed_kmh numeric,
  last_seen_at timestamptz,
  started_at timestamptz not null default now(),
  ended_at timestamptz
);
-- one active trip per vehicle
create unique index trips_one_active_per_vehicle on public.trips (vehicle_id) where status = 'active';

create table public.positions (
  id bigint generated always as identity primary key,
  trip_id uuid not null references public.trips (id) on delete cascade,
  geom extensions.geography(Point, 4326) not null,
  speed_kmh numeric,
  heading numeric,
  recorded_at timestamptz not null
);
create index positions_trip_time on public.positions (trip_id, recorded_at desc);

create table public.segment_speeds (
  route_id uuid not null references public.routes (id) on delete cascade,
  segment_no int not null,
  hour smallint not null check (hour between 0 and 23),
  day_type text not null check (day_type in ('weekday', 'weekend')),
  avg_speed_kmh numeric not null,
  samples int not null,
  primary key (route_id, segment_no, hour, day_type)
);

create table public.incidents (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles (id) default auth.uid(),
  type public.incident_type not null,
  description text check (char_length(description) <= 500),
  photo_path text,
  geom extensions.geography(Point, 4326) not null,
  status public.review_status not null default 'pending',
  expires_at timestamptz not null default now() + interval '6 hours',
  created_at timestamptz not null default now()
);
create index incidents_geom on public.incidents using gist (geom);

create table public.fare_rules (
  id uuid primary key default gen_random_uuid(),
  lgu text not null,
  base_fare numeric not null,
  base_km numeric not null,
  per_km numeric not null,
  effective_date date not null
);

create table public.fare_complaints (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles (id) default auth.uid(),
  from_geom extensions.geography(Point, 4326) not null,
  to_geom extensions.geography(Point, 4326) not null,
  charged numeric not null,
  expected numeric,
  tricycle_no text,
  status public.review_status not null default 'pending',
  created_at timestamptz not null default now()
);

create table public.waiting_signals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) default auth.uid(),
  route_id uuid not null references public.routes (id) on delete cascade,
  geom extensions.geography(Point, 4326) not null,
  expires_at timestamptz not null default now() + interval '30 minutes'
);

create table public.rider_full_reports (
  trip_id uuid not null references public.trips (id) on delete cascade,
  user_id uuid not null references public.profiles (id) default auth.uid(),
  created_at timestamptz not null default now(),
  primary key (trip_id, user_id)
);

create table public.alert_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) default auth.uid(),
  trip_id uuid references public.trips (id) on delete cascade,
  route_id uuid references public.routes (id) on delete cascade,
  geom extensions.geography(Point, 4326) not null,
  minutes_before int not null default 10 check (minutes_before between 1 and 60),
  active boolean not null default true,
  check (trip_id is not null or route_id is not null)
);

create table public.push_tokens (
  user_id uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  expo_push_token text not null,
  platform text not null check (platform in ('android', 'ios')),
  primary key (user_id, expo_push_token)
);

-- ---------- helpers ----------
-- Role of the signed-in user. security definer so policies can read profiles without recursion.
create function public.my_role() returns public.user_role
language sql stable security definer set search_path = '' as $$
  select role from public.profiles where id = auth.uid()
$$;

create function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select role = 'admin' from public.profiles where id = auth.uid()), false)
$$;

create function public.is_staff_or_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select role in ('staff', 'admin') from public.profiles where id = auth.uid()), false)
$$;

-- Every new account starts as a commuter; admins promote crew and staff.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, full_name) values (new.id, new.raw_user_meta_data ->> 'full_name');
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- row level security ----------
alter table public.profiles enable row level security;
alter table public.routes enable row level security;
alter table public.hubs enable row level security;
alter table public.vehicles enable row level security;
alter table public.trips enable row level security;
alter table public.positions enable row level security;
alter table public.segment_speeds enable row level security;
alter table public.incidents enable row level security;
alter table public.fare_rules enable row level security;
alter table public.fare_complaints enable row level security;
alter table public.waiting_signals enable row level security;
alter table public.rider_full_reports enable row level security;
alter table public.alert_subscriptions enable row level security;
alter table public.push_tokens enable row level security;

-- profiles: see and edit your own name/phone; admins manage everyone. Role changes are admin-only.
create policy "own profile" on public.profiles for select to authenticated using (id = auth.uid() or public.is_staff_or_admin());
create policy "edit own profile" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid() and role = public.my_role());
create policy "admin manages profiles" on public.profiles for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- public reference data: anyone can read, admins write.
create policy "read routes" on public.routes for select to anon, authenticated using (active or public.is_staff_or_admin());
create policy "admin writes routes" on public.routes for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "read hubs" on public.hubs for select to anon, authenticated using (true);
create policy "admin writes hubs" on public.hubs for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "read vehicles" on public.vehicles for select to anon, authenticated using (true);
create policy "admin writes vehicles" on public.vehicles for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "read fare rules" on public.fare_rules for select to anon, authenticated using (true);
create policy "admin writes fare rules" on public.fare_rules for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "read segment speeds" on public.segment_speeds for select to anon, authenticated using (true);
-- segment_speeds is written only by scheduled jobs (service role), so it has no write policy.

-- trips: everyone sees active trips; crew start and update only their own, on their assigned vehicle.
create policy "read trips" on public.trips for select to anon, authenticated
  using (status = 'active' or crew_id = auth.uid() or public.is_staff_or_admin());
create policy "crew starts own trip" on public.trips for insert to authenticated
  with check (
    crew_id = auth.uid() and public.my_role() = 'crew'
    and exists (select 1 from public.vehicles v where v.id = vehicle_id and v.assigned_crew_id = auth.uid())
  );
create policy "crew updates own trip" on public.trips for update to authenticated
  using (crew_id = auth.uid()) with check (crew_id = auth.uid());
create policy "staff ends trips" on public.trips for update to authenticated
  using (public.is_staff_or_admin()) with check (public.is_staff_or_admin());

-- positions: crew add points to their own active trip; staff and admin read history.
create policy "crew adds positions" on public.positions for insert to authenticated
  with check (exists (select 1 from public.trips t where t.id = trip_id and t.crew_id = auth.uid() and t.status = 'active'));
create policy "staff reads positions" on public.positions for select to authenticated using (public.is_staff_or_admin());

-- incidents: everyone sees approved ones; signed-in users report; reporters see their own; admins review.
create policy "read approved incidents" on public.incidents for select to anon, authenticated
  using ((status = 'approved' and expires_at > now()) or reporter_id = auth.uid() or public.is_staff_or_admin());
create policy "report incident" on public.incidents for insert to authenticated
  with check (reporter_id = auth.uid() and status = 'pending');
create policy "admin reviews incidents" on public.incidents for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- fare complaints: private to the reporter and admins.
create policy "own fare complaints" on public.fare_complaints for select to authenticated using (reporter_id = auth.uid() or public.is_admin());
create policy "file fare complaint" on public.fare_complaints for insert to authenticated
  with check (reporter_id = auth.uid() and status = 'pending');
create policy "admin reviews fare complaints" on public.fare_complaints for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- waiting signals: commuters manage their own; crew, staff and admins see them.
create policy "own waiting signals" on public.waiting_signals for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "crew sees waiting signals" on public.waiting_signals for select to authenticated
  using (expires_at > now() and (public.my_role() = 'crew' or public.is_staff_or_admin()));

-- rider "Full" reports: insert your own; admins read.
create policy "report full" on public.rider_full_reports for insert to authenticated with check (user_id = auth.uid());
create policy "admin reads full reports" on public.rider_full_reports for select to authenticated using (public.is_admin());

-- alerts and push tokens: strictly your own.
create policy "own alerts" on public.alert_subscriptions for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own push tokens" on public.push_tokens for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------- realtime: live positions on private channels "route:<route_id>" ----------
-- Only crew with an active trip on that route may send; anyone may listen.
-- ponytail: verify anon listening on private channels against current Supabase Realtime docs in Sprint 2.
create policy "crew broadcasts own route" on realtime.messages for insert to authenticated
  with check (
    realtime.messages.extension = 'broadcast'
    and exists (
      select 1 from public.trips t
      where t.crew_id = auth.uid() and t.status = 'active'
        and realtime.topic() = 'route:' || t.route_id::text
    )
  );
create policy "anyone listens to routes" on realtime.messages for select to anon, authenticated
  using (realtime.messages.extension = 'broadcast' and realtime.topic() like 'route:%');
