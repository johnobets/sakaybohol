-- Road incident reporting (spec feature 11).

-- Photos: public read (paths are random UUIDs; only approved reports are listed anywhere),
-- upload only by signed-in users into a folder named after their own user id. Images only, 5 MB max.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('incident-photos', 'incident-photos', true, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/heic']);

create policy "upload own incident photos" on storage.objects for insert to authenticated
  with check (bucket_id = 'incident-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Map-ready incidents. RLS on incidents still decides which rows each caller sees:
-- everyone sees approved, unexpired ones; reporters see their own; staff and admins see all.
create view public.incident_points with (security_invoker = true) as
  select id, type, description, photo_path, status, created_at, expires_at,
         extensions.st_asgeojson(geom)::json as geojson
  from public.incidents;

grant select on public.incident_points to anon, authenticated;
