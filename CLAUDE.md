# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Workspace Layout

```
bmad_new/
├── commute-share/        React Native app (primary work area)
├── _bmad/                BMAD AI-workflow framework (planning tooling, not app code)
├── _bmad-output/         Planning artifacts, specs, and session handoffs
└── bmad_project1/        BMAD installer Python venv (ignore)
```

All application development happens inside `commute-share/`. Run all npm/expo commands from that directory.

## Commands (run from `commute-share/`)

```bash
npx expo start            # Dev server (prompts for platform)
npm run web               # expo start --web  (primary dev target)
npm run android           # expo start --android
npm run ios               # expo start --ios
npx tsc --noEmit          # Type-check (no test runner configured)
```

No ESLint config and no Jest setup exist yet.

## Expo Version Note

**Expo SDK 56 — always read the exact versioned docs at https://docs.expo.dev/versions/v56.0.0/ before writing any Expo/RN code.** APIs change between SDK versions.

## Architecture

### Routing (`app/`)

Expo Router file-based routing with three route groups:

- `(auth)/` — Unauthenticated flows. Root layout redirects here when no session.
- `(app)/` — Authenticated screens. Root layout redirects here when session exists.
- `(tabs)/` — Secondary tab scaffold (stub, not primary).

`app/_layout.tsx` is the root orchestrator: loads fonts, subscribes to `supabase.auth.onAuthStateChange`, and performs the auth gate redirect.

### Lib Layer (`lib/`)

- `supabase.ts` — Supabase client singleton. Uses `expo-secure-store` on native, `localStorage` on web (with `typeof localStorage` guard for SSR safety). Reads `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` from env.
- `auth.ts` — Auth wrappers: `register(username, email, password, phone)`, `login(email, password)`, `resendVerificationEmail(email)`, `signOut()`. (`verifyEmailOtp` exists but is unused — email verification uses confirmation links, not OTP codes.)

### Database (`supabase/migrations/`)

- `001_profiles.sql` — `public.profiles`: id (FK → auth.users), username (unique not null), phone (unique), avatar_url, role (driver/passenger/both), created_at. Full RLS: users touch only their own row. Includes `check_availability(field_name, field_value)` SECURITY DEFINER RPC callable by anon for pre-signup uniqueness checks.
- `002_driver_verifications.sql` — `public.driver_verifications`: licence_storage_path, verification_status (pending/approved/rejected). RLS: users insert only; service-role updates status. Also creates `avatars` (public) and `licences` (private) Storage buckets.
- `003_routes.sql` — `public.routes`: driver_id (FK → profiles), origin/dest lat-lng + addresses, route_polyline (encoded), detour_tolerance_km (int, default 5), detour_tolerance_min (int, default 10), departure_time (time), schedule_days (int[], 1=Mon…7=Sun), status (active/paused/deleted). RLS: owner-only (all four operations check `auth.uid() = driver_id`).
- `004_routes_rls_passenger.sql` — **NOT YET APPLIED** (Goal 3). Adds SELECT policy: `status = 'active' AND driver_id != auth.uid()` so passengers can discover other drivers' active routes.

### Auth & Onboarding Flow

Registration: `register.tsx` (username + email + password + phone) → `verify-email.tsx` (static "click the link" waiting screen; navigates automatically when Supabase fires `onAuthStateChange`) → `role.tsx` → `profile.tsx` (avatar upload) → `licence.tsx` (drivers only) → `(app)/index.tsx`.

Profile creation: happens in `app/_layout.tsx` on the first confirmed sign-in (`email_confirmed_at` present, no profile row yet) — reads `username` and `phone` from `user_metadata` set during `signUp`. The role screen also does a full upsert including `username`+`phone` as a safety net.

Login: `login.tsx` (email + password) → root layout queries `profiles.role` → routes to `(app)` or `(auth)/role` if onboarding incomplete.

## Current Implementation Status

**Goal 1 (Auth & Onboarding) is complete.** All screens implemented, TypeScript clean.

Auth strategy: email + password + username (display handle). Email confirmation link (not OTP code) for verification. Phone collected at registration but SMS-verified later. Profile row created in `_layout.tsx` on first confirmed sign-in.

Full spec: `_bmad-output/implementation-artifacts/spec-user-auth-verification.md` (status: done)

**Goal 2 (Driver Route Setup) is complete.** Routes tab, Google Places autocomplete, route polyline preview, detour tolerance, schedule, Supabase CRUD — all implemented and live-tested.

Full spec: `_bmad-output/implementation-artifacts/spec-goal-2-driver-route-setup.md` (status: done)

**Post-Goals 1–2 bug fixes applied (2026-06-15):**
- `app.json` web output changed to `"single"` — fixes Node 20 WebSocket crash on `npm run web`
- Google API endpoints migrated to new versions: Places API (New) at `places.googleapis.com`, Routes API at `routes.googleapis.com`. Legacy `maps.googleapis.com/maps/api/...` endpoints removed. `routingPreference` removed (caused 400 on demo keys). Field mask fixed: `routes.polyline` not `routes.overviewPolyline`.
- Email verification changed from OTP code entry to confirmation link — `verify-email.tsx` is now a static waiting screen; `_layout.tsx` creates profile on confirmed sign-in.
- `role.tsx` upsert now includes `username`+`phone` from `user_metadata` — prevents NOT NULL violation when profile row is absent.
- Dev user added: `dev@commuteshare.local` / `Dev1234!` (role: both). Created via Supabase dashboard → Auth → Add user → Auto Confirm. Profile inserted via `supabase/seeds/dev_user.sql`. Login screen shows ⚡ Dev Login button in `__DEV__` mode.

Implementation-level deferred items: `_bmad-output/implementation-artifacts/deferred-work.md`

**Goal 3 (Passenger Ride Discovery) — spec approved, ready for implementation.**

Spec: `_bmad-output/implementation-artifacts/spec-goal-3-passenger-ride-discovery.md` (status: ready-for-dev)

What Goal 3 will build:
- `supabase/migrations/004_routes_rls_passenger.sql` — RLS SELECT policy for passenger discovery
- `lib/matching.ts` — Google Encoded Polyline decoder, Haversine distance, corridor match predicate (`matchesPassengerCorridor`)
- `lib/routes.ts` — add `getActiveRoutesForDiscovery(userId)` function
- `app/(app)/discover/index.tsx` — new "Find Rides" screen: Places autocomplete origin+dest, Search button, client-side corridor filtering, results list
- `app/(app)/_layout.tsx` — add third "Find Rides" tab (`search-outline` icon)

Key design decisions locked in spec:
- Matching: point-proximity Haversine (both origin AND dest within `detour_tolerance_km` of nearest polyline vertex). Client-side. No PostGIS.
- No map visualization, no driver name join, no schedule filter, no booking action — all deferred to Goal 4+.
- Resume implementation: run `/bmad-quick-dev` and it will route directly to step-03 (implement) from the ready-for-dev spec.

## Planning Artifacts

`_bmad-output/planning-artifacts/project-context.md` — product vision, target audience, full tech stack, all 7 implementation goals with status.  
`_bmad-output/implementation-artifacts/deferred-work.md` — Goals 2–7 (maps, matching, booking, payments, chat/safety, ratings).
