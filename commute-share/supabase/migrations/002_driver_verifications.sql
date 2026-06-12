-- Migration 002: driver_verifications table + storage buckets
-- Stores the outcome of manual driver licence review.
-- The actual image is stored in the private "licences" bucket;
-- only the storage path is persisted here — never a public URL.

create table if not exists public.driver_verifications (
  id                    uuid        primary key default gen_random_uuid(),
  user_id               uuid        not null references public.profiles (id) on delete cascade,
  licence_storage_path  text        not null,
  verification_status   text        not null
                          check (verification_status in ('pending', 'approved', 'rejected'))
                          default 'pending',
  submitted_at          timestamptz not null default now()
);

-- Row Level Security
alter table public.driver_verifications enable row level security;

-- Drivers can read their own verification record(s)
create policy "users_select_own_verifications"
  on public.driver_verifications
  for select
  using (auth.uid() = user_id);

-- Drivers can insert a new verification submission
create policy "users_insert_own_verification"
  on public.driver_verifications
  for insert
  with check (auth.uid() = user_id);

-- Only service-role (admin) can update the status — no client policy needed;
-- all authenticated updates will be blocked by default.

-- ============================================================
-- Storage buckets
-- Run these statements in the Supabase SQL editor or via CLI.
-- The storage extension must already be enabled (it is by default).
-- ============================================================

-- Public "avatars" bucket: profile photos are readable by anyone
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

-- RLS for avatars: any authenticated user can upload/replace their own avatar
create policy "avatars_insert_own"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "avatars_update_own"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Private "licences" bucket: images are NOT publicly accessible
insert into storage.buckets (id, name, public)
values ('licences', 'licences', false)
on conflict (id) do nothing;

-- Only the owner can upload their licence; nobody can read via the client
create policy "licences_insert_own"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'licences'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- No client SELECT policy on licences — service role only
