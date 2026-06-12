-- Migration 001: profiles table + availability RPC
-- username is the unique in-app display handle (not a login credential).
-- phone is collected at registration but SMS-verified later (Goal 2+).

create table if not exists public.profiles (
  id          uuid        primary key references auth.users (id) on delete cascade,
  username    text        unique not null,
  phone       text        unique,
  avatar_url  text,
  role        text        check (role in ('driver', 'passenger', 'both')),
  created_at  timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "users_select_own_profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "users_insert_own_profile"
  on public.profiles for insert
  with check (auth.uid() = id);

create policy "users_update_own_profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

create policy "users_delete_own_profile"
  on public.profiles for delete
  using (auth.uid() = id);

-- Called unauthenticated (before account creation) to check username/phone uniqueness.
create or replace function public.check_availability(
  field_name  text,
  field_value text
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if field_name = 'username' then
    return not exists (select 1 from public.profiles where username = field_value);
  elsif field_name = 'phone' then
    return not exists (select 1 from public.profiles where phone = field_value);
  end if;
  raise exception 'unknown field_name: %', field_name;
end;
$$;

grant execute on function public.check_availability(text, text) to anon, authenticated;
