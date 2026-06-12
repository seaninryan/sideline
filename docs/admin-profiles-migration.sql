-- Admin / profiles migration. Run ONCE in the Supabase SQL editor.

-- 1. profiles table (one row per signed-up user)
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  avatar_url text,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

-- 2. signup trigger: copy email + Google metadata on each new auth user
create or replace function public.handle_new_user()
  returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (new.id, new.email,
          new.raw_user_meta_data->>'full_name',
          new.raw_user_meta_data->>'avatar_url')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 3. backfill existing users
insert into public.profiles (id, email, full_name, avatar_url, created_at)
select id, email,
       raw_user_meta_data->>'full_name',
       raw_user_meta_data->>'avatar_url',
       created_at
from auth.users
on conflict (id) do nothing;

-- 4. is_admin() helper (security definer → reads profiles bypassing RLS, no recursion)
create or replace function public.is_admin()
  returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and is_admin);
$$;

-- 5. RLS
alter table profiles enable row level security;
create policy profiles_self_read  on profiles for select using (id = auth.uid());
create policy profiles_admin_read on profiles for select using (public.is_admin());

-- admins can read every match (counts + opening another user's match)
create policy matches_admin_read on matches for select using (public.is_admin());

-- 6. make yourself admin (run once, after the table exists)
update profiles set is_admin = true where email = 'sean.r@edgescan.com';
