-- Dev seed: creates a pre-verified user you can log in with immediately.
-- Credentials: dev@commuteshare.local / Dev1234!
-- Role: both (can see driver Routes tab AND passenger features)
--
-- Run once in Supabase SQL Editor. Safe to re-run (skips if email already exists).

do $$
declare
  dev_uid uuid;
begin
  -- Skip if already exists
  if exists (select 1 from auth.users where email = 'dev@commuteshare.local') then
    raise notice 'Dev user already exists — skipping.';
    return;
  end if;

  dev_uid := gen_random_uuid();

  insert into auth.users (
    id, instance_id, aud, role,
    email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data,
    is_super_admin, created_at, updated_at
  ) values (
    dev_uid,
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated',
    'dev@commuteshare.local',
    crypt('Dev1234!', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    false, now(), now()
  );

  insert into auth.identities (
    id, user_id, provider_id, provider,
    identity_data, last_sign_in_at, created_at, updated_at
  ) values (
    gen_random_uuid(),
    dev_uid,
    'dev@commuteshare.local',
    'email',
    jsonb_build_object('sub', dev_uid::text, 'email', 'dev@commuteshare.local'),
    now(), now(), now()
  );

  insert into public.profiles (id, username, phone, role)
  values (dev_uid, 'devuser', '+36201234567', 'both');

  raise notice 'Dev user created: dev@commuteshare.local / Dev1234!';
end $$;
