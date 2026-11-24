-- Users screen (admin dashboard): list accounts with their email and change roles.

-- Emails live in auth.users, which the apps cannot read, so this definer function exposes
-- only what the screen needs, and only to staff and admins.
-- ponytail: returns every account; add paging + server-side search past a few thousand users.
create function public.admin_users()
returns table (id uuid, email text, full_name text, phone text, role public.user_role,
               created_at timestamptz, last_sign_in_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_staff_or_admin() then
    raise exception 'staff or admin only' using errcode = '42501';
  end if;
  return query
    select p.id, u.email::text, p.full_name, p.phone, p.role, p.created_at, u.last_sign_in_at
    from public.profiles p join auth.users u on u.id = p.id
    order by p.created_at desc;
end;
$$;
revoke execute on function public.admin_users() from public, anon;
grant execute on function public.admin_users() to authenticated;

-- Admins change roles here. An admin cannot change their own role, so the last admin
-- can never lock everyone out of the dashboard by accident.
create function public.set_user_role(p_user uuid, p_role public.user_role)
returns public.user_role
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  if p_user = (select auth.uid()) then
    raise exception 'you cannot change your own role' using errcode = '42501';
  end if;
  update public.profiles set role = p_role where id = p_user;
  if not found then
    raise exception 'no such user' using errcode = 'P0002';
  end if;
  return p_role;
end;
$$;
revoke execute on function public.set_user_role(uuid, public.user_role) from public, anon;
grant execute on function public.set_user_role(uuid, public.user_role) to authenticated;
