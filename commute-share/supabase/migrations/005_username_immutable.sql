-- 005_username_immutable.sql
-- Enforce username immutability at the DB layer.
-- A BEFORE UPDATE trigger is used because RLS UPDATE policies cannot
-- distinguish which columns are being modified.

create or replace function public.prevent_username_change()
returns trigger
language plpgsql
as $$
begin
  if NEW.username IS DISTINCT FROM OLD.username then
    raise exception 'username is immutable';
  end if;
  return NEW;
end;
$$;

create trigger trg_prevent_username_change
  before update on public.profiles
  for each row execute function public.prevent_username_change();
