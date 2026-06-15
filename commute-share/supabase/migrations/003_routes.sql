-- 003_routes.sql
-- Driver commute routes table with RLS

create table public.routes (
  id                    uuid primary key default gen_random_uuid(),
  driver_id             uuid not null references public.profiles(id) on delete cascade,
  origin_address        text not null,
  origin_lat            float8 not null,
  origin_lng            float8 not null,
  destination_address   text not null,
  destination_lat       float8 not null,
  destination_lng       float8 not null,
  route_polyline        text not null,
  detour_tolerance_km   int not null default 5,
  detour_tolerance_min  int not null default 10,
  departure_time        time not null,
  schedule_days         int[] not null,
  status                text not null default 'active' check (status in ('active', 'paused', 'deleted')),
  created_at            timestamptz default now()
);

-- Enable Row Level Security
alter table public.routes enable row level security;

-- Owner-only policies: drivers CRUD only their own rows
create policy "routes_select_own"
  on public.routes
  for select
  using (auth.uid() = driver_id);

create policy "routes_insert_own"
  on public.routes
  for insert
  with check (auth.uid() = driver_id);

create policy "routes_update_own"
  on public.routes
  for update
  using (auth.uid() = driver_id)
  with check (auth.uid() = driver_id);

create policy "routes_delete_own"
  on public.routes
  for delete
  using (auth.uid() = driver_id);
