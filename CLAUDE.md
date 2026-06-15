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
- `auth.ts` — Auth wrappers: `register(username, email, password, phone)`, `login(email, password)`, `verifyEmailOtp(email, token)`, `resendVerificationEmail(email)`, `signOut()`.

### Database (`supabase/migrations/`)

- `001_profiles.sql` — `public.profiles`: id (FK → auth.users), username (unique not null), phone (unique), avatar_url, role (driver/passenger/both), created_at. Full RLS: users touch only their own row. Includes `check_availability(field_name, field_value)` SECURITY DEFINER RPC callable by anon for pre-signup uniqueness checks.
- `002_driver_verifications.sql` — `public.driver_verifications`: licence_storage_path, verification_status (pending/approved/rejected). RLS: users insert only; service-role updates status. Also creates `avatars` (public) and `licences` (private) Storage buckets.

### Auth & Onboarding Flow

Registration: `register.tsx` (username + email + password + phone) → `verify-email.tsx` (email OTP, 10 min, 3-attempt lock; profiles row inserted here after OTP success) → `role.tsx` → `profile.tsx` (avatar upload) → `licence.tsx` (drivers only) → `(app)/index.tsx`.

Login: `login.tsx` (email + password) → root layout queries `profiles.role` → routes to `(app)` or `(auth)/role` if onboarding incomplete.

## Current Implementation Status

**Goal 1 (Auth & Onboarding) is complete.** All screens implemented, TypeScript clean, review patches applied.

Auth strategy: email + password + username (display handle). Email OTP for verification. Phone collected at registration but SMS-verified later (Goal 2+). Old phone+SMS OTP screens deleted.

Full spec and acceptance criteria: `_bmad-output/implementation-artifacts/spec-user-auth-verification.md` (status: done)

**Goal 2 (Driver Route Setup) is complete.** Routes tab added; Google Places autocomplete, Directions API polyline, detour tolerance (km + auto-calculated min), schedule, Supabase CRUD — all implemented. TypeScript clean, review patches applied.

Full spec and acceptance criteria: `_bmad-output/implementation-artifacts/spec-goal-2-driver-route-setup.md` (status: done)  
Implementation-level deferred items: `_bmad-output/implementation-artifacts/deferred-work.md`  
**Next goal:** Goal 3 — Passenger ride discovery (corridor-based matching engine, ride browsing, map visualization).

## Planning Artifacts

`_bmad-output/planning-artifacts/project-context.md` — product vision, target audience, full tech stack, all 7 implementation goals with status.  
`_bmad-output/implementation-artifacts/deferred-work.md` — Goals 2–7 (maps, matching, booking, payments, chat/safety, ratings).
