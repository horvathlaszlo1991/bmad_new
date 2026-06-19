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

## Environment Note

**Windows Python**: Use `python` (not `python3`) — `python3` is not mapped on this machine.

## Commands (run from `commute-share/`)

```bash
npx expo start            # Dev server (prompts for platform)
npm run web               # expo start --web  (primary dev target)
npm run android           # expo start --android
npm run ios               # expo start --ios
npx tsc --noEmit          # Type-check
npm test                  # Run Jest unit tests
npm run test:watch        # Jest in watch mode
```

No ESLint config.

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
- `004_routes_rls_passenger.sql` — Adds SELECT policy: `status = 'active' AND driver_id != auth.uid()` so passengers can discover other drivers' active routes. Applied to Supabase (Goal 3).

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

**Goal 3 (Passenger Ride Discovery) is complete.** Find Rides tab, Places autocomplete origin+dest, client-side Haversine corridor matching, results list — all implemented, reviewed, and live-tested.

Full spec: `_bmad-output/implementation-artifacts/spec-goal-3-passenger-ride-discovery.md` (status: done, commit: 854bf79)

Key additions:
- `supabase/migrations/004_routes_rls_passenger.sql` — RLS SELECT policy (applied to Supabase)
- `lib/matching.ts` — Google Encoded Polyline decoder, Haversine distance, `matchesPassengerCorridor`
- `lib/routes.ts` — `getActiveRoutesForDiscovery(userId)`
- `app/(app)/discover/index.tsx` — Find Rides screen with four render states
- `app/(app)/_layout.tsx` — third tab (`search-outline`)

**Unit tests added (Goal 3, commit 37b673e):**

Jest is configured (`jest.config.js`, `ts-jest`, `node` environment). Run with `npm test`.

- `__tests__/matching.test.ts` — 23 tests covering all four exports in `lib/matching.ts` (decodePolyline, haversineKm, minDistanceToPolylineKm, matchesPassengerCorridor). All passing.

**Testing requirement (from Goal 3 onward): every implementation goal must include unit tests for all new pure logic (lib/ functions, utilities, algorithms).** Tests are part of the definition of done and must pass before a goal is marked complete.

**Goal 4a (Booking Request Flow) is complete.** Driver username on result cards, "Request Ride" CTA, `bookings` table with full RLS, My Rides screen (Passenger + Driver segments), username immutability enforced at DB layer — all implemented, reviewed (3-reviewer loop, 9 patches), and committed.

Full spec: `_bmad-output/implementation-artifacts/spec-goal-4a-booking-request-flow.md` (status: done, commit: 5f7d33f)

Key additions:
- `supabase/migrations/005_username_immutable.sql` — BEFORE UPDATE trigger: `username` cannot be changed after creation (applied to Supabase)
- `supabase/migrations/006_bookings.sql` — `bookings` table, 4 RLS policies, partial unique index allowing re-request after declined, BEFORE INSERT trigger derives `driver_id` server-side, BEFORE UPDATE trigger sets `confirmed_at` (applied to Supabase)
- `lib/routes.ts` — `RouteWithDriver` type; `getActiveRoutesForDiscovery` now joins `profiles!driver_id(username)`
- `lib/bookings.ts` — `validateBookingRequest` (pure), `createBookingRequest`, `getMyBookingsAsPassenger`, `getPendingRequestsForDriver`, `respondToBooking` (guarded with `.eq('status','pending')`)
- `app/(app)/discover/index.tsx` — driver username on cards, 4-state request button (Request Ride / Pending / Confirmed / Request Again)
- `app/(app)/bookings/index.tsx` — My Rides screen; Passenger tab shows all bookings with status badges; Driver tab shows pending requests with Accept/Decline
- `app/(app)/_layout.tsx` — 4th tab added (`bookmark-outline`, "My Rides")
- `__tests__/bookings.test.ts` — 6 unit tests for `validateBookingRequest` (29 total, all passing)

**Goal 4 is split into slices:** 4a (done), 4b (cancellation windows + no-show, deferred), 4c (trusted-pair fast-track + deposit, deferred).

## Goal Completion Checklist

After every completed goal (or any similarly significant change), always perform these steps in order before finishing:

1. Write new unit tests for any new pure logic added (lib/ functions, utilities, algorithms).
2. `npm test` — all tests (existing + new) must pass.
3. Update `CLAUDE.md` with the goal's completion block, key additions, and commit hash.
4. Update `_bmad-output/implementation-artifacts/sprint-status.yaml` — current position, completed items, key decisions, next steps.
5. Update `_bmad-output/planning-artifacts/project-context.md` — goals table and design decisions section.
6. Create a git commit with all changes.

## Planning Artifacts

`_bmad-output/planning-artifacts/project-context.md` — product vision, target audience, full tech stack, all 7 implementation goals with status.  
`_bmad-output/implementation-artifacts/deferred-work.md` — Goals 2–7 (maps, matching, booking, payments, chat/safety, ratings).
