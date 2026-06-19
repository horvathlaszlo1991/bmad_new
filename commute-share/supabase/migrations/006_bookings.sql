-- 006_bookings.sql
-- Booking requests: passengers request a seat on a driver's route.
-- driver_id is denormalized from routes.driver_id at INSERT time so that
-- the driver's RLS SELECT policy can be a simple equality check without a join.

create table public.bookings (
  id             uuid        primary key default gen_random_uuid(),
  route_id       uuid        not null references public.routes(id) on delete cascade,
  driver_id      uuid        not null references public.profiles(id) on delete cascade,
  passenger_id   uuid        not null references public.profiles(id) on delete cascade,
  status         text        not null
                               check (status in ('pending', 'confirmed', 'declined', 'cancelled'))
                               default 'pending',
  requested_at   timestamptz not null default now(),
  confirmed_at   timestamptz,
  passenger_note text,
);

alter table public.bookings enable row level security;

-- Passenger INSERT: can only insert for themselves, and cannot book their own route
create policy "bookings_passenger_insert"
  on public.bookings
  for insert
  with check (passenger_id = auth.uid() and passenger_id != driver_id);

-- Passenger SELECT: own bookings only
create policy "bookings_passenger_select"
  on public.bookings
  for select
  using (passenger_id = auth.uid());

-- Driver SELECT: bookings on their routes only
create policy "bookings_driver_select"
  on public.bookings
  for select
  using (driver_id = auth.uid());

-- Driver UPDATE: can update status on their own route bookings
create policy "bookings_driver_update"
  on public.bookings
  for update
  using (driver_id = auth.uid())
  with check (driver_id = auth.uid());

create unique index bookings_route_passenger_active_uidx
  on public.bookings (route_id, passenger_id)
  where status not in ('declined', 'cancelled');

create or replace function public.bookings_set_driver_id()
returns trigger language plpgsql security definer as $$
begin
  select driver_id into NEW.driver_id
    from public.routes
   where id = NEW.route_id;
  if NEW.driver_id is null then
    raise exception 'route not found or has no driver';
  end if;
  return NEW;
end;
$$;

create trigger trg_bookings_set_driver_id
  before insert on public.bookings
  for each row execute function public.bookings_set_driver_id();

create or replace function public.bookings_set_confirmed_at()
returns trigger language plpgsql as $$
begin
  if NEW.status = 'confirmed' and OLD.status != 'confirmed' then
    NEW.confirmed_at := now();
  end if;
  return NEW;
end;
$$;

create trigger trg_bookings_set_confirmed_at
  before update on public.bookings
  for each row execute function public.bookings_set_confirmed_at();
