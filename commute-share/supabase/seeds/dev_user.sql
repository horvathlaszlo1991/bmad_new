-- Dev seed: creates a pre-verified user you can log in with immediately.
-- Credentials: dev@commuteshare.local / Dev1234!
-- Role: both (can see driver Routes tab AND passenger features)
--
-- NOTE: This script cannot set the password correctly from SQL because
-- Supabase Auth requires $2b$ bcrypt format which differs from PostgreSQL's crypt().
-- Use this script ONLY if you have already created the user via the Supabase dashboard
-- (Authentication → Users → Add user → Auto Confirm User) and just need the profile row.
--
-- Full setup steps:
-- 1. Supabase dashboard → Authentication → Users → Add user → Create new user
--    Email: dev@commuteshare.local  Password: Dev1234!  ✓ Auto Confirm User
-- 2. Run this script to insert the matching profile row.

insert into public.profiles (id, username, phone, role)
select id, 'devuser', '+36201234567', 'both'
from auth.users
where email = 'dev@commuteshare.local'
  and not exists (
    select 1 from public.profiles p
    join auth.users u on u.id = p.id
    where u.email = 'dev@commuteshare.local'
  );
