---
title: 'User Auth & Verification — Email/Password + Username Registration'
type: 'feature'
created: '2026-06-12'
status: 'done'
baseline_commit: 'NO_VCS'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** No application exists yet — users have no way to register with secure credentials, verify their identity, or establish their commuting role.

**Approach:** Scaffold a React Native + Expo (TypeScript) app backed by Supabase implementing email + password registration with email OTP verification, username as a unique in-app display handle, phone number collected (but SMS-verified later), login via email + password, role selection, avatar upload, and driver licence upload with a pending-verification state.

## Boundaries & Constraints

**Always:**
- Registration collects: username (unique display handle), email, password (min 8 chars), phone (E.164 format). Email verified via OTP before any profile data is written.
- Login uses email + password. Username is never used as a login credential — only as an in-app identity seen by other users.
- Duplicate username, phone, and email each produce a distinct inline error at registration — no account is created if any duplicate is found.
- Phone uniqueness checked via a `check_availability` Supabase RPC function (SECURITY DEFINER) before account creation, so the check works from an unauthenticated client.
- Expo Router (file-based navigation) for all screens.
- All Supabase DB writes protected by Row Level Security — users read/write only their own rows.
- Driver licence images stored in a private Supabase storage bucket; only `verification_status` and the storage path are persisted.
- GDPR-minimal schema: only fields listed in the migrations. No extra fields without explicit decision.
- `expo-secure-store` on native / `localStorage` on web as Supabase session adapter.

**Ask First:**
- If Google or Apple social login should be added at this stage.
- If a "Forgot password" (email reset) flow is needed now.

**Never:**
- No phone SMS OTP at registration — phone verification deferred to ride-posting (Goal 2+).
- No username-based login.
- No gender, age, or demographic fields.
- No in-app wallet, payments, booking, or matching logic.
- No third-party identity verification service at this stage.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| New registration — all valid | username, email, password, phone | Supabase account created; OTP email sent; verify-email screen shown | — |
| Duplicate username | Username already in profiles | "Username already taken" inline error; no account created | — |
| Duplicate phone | Phone already in profiles | "Number already registered — log in or use a different number" inline error; no account created | — |
| Duplicate email | Email already in auth.users | "Email already in use" inline error; no account created | — |
| Email OTP success | Correct code within 10 min | Session created; navigate to role selection | — |
| Email OTP wrong (< 3 attempts) | Incorrect code | Inline error; retry | — |
| Email OTP wrong (3rd attempt) | Incorrect code | Input disabled; Resend button shown | — |
| Email OTP expired | Code not entered within 10 min | "Code expired"; Resend button shown | — |
| Login — valid credentials | Correct email + password | Session created; if role set → home; if no role → role selection | — |
| Login — wrong password | Wrong password or unknown email | "Incorrect email or password" (generic; no account enumeration) | — |
| Login — unverified email | Email not yet confirmed | "Please verify your email first" with Resend option | — |
| Role = Driver or Both | User selects Driver or Both | Licence upload screen shown after avatar step | — |
| Avatar upload fails | Network error | Non-blocking warning shown; default avatar used; profile creation continues | — |
| Licence upload fails | Network error | Error shown; retry button; no `driver_verifications` row created | — |
| App opened — session + role set | Valid session + complete profile | Root layout → home screen; no re-auth | — |
| App opened — session + no role | Verified but onboarding incomplete | Root layout → role selection screen | — |
| App opened — no session | No stored session | Root layout → login screen | — |

</frozen-after-approval>

## Code Map

Greenfield — all paths below are to be created (replacing previous phone-OTP screens):

- `commute-share/lib/supabase.ts` -- Supabase client (SecureStore on native, localStorage on web)
- `commute-share/lib/auth.ts` -- register / login / verifyEmailOtp / resendVerificationEmail / signOut
- `commute-share/app/_layout.tsx` -- root layout: session guard + profile-completeness check
- `commute-share/app/(auth)/_layout.tsx` -- auth stack navigator
- `commute-share/app/(auth)/register.tsx` -- username + email + password + phone form
- `commute-share/app/(auth)/verify-email.tsx` -- email OTP input (10-min countdown, 3-attempt lock, resend)
- `commute-share/app/(auth)/login.tsx` -- email + password login; handles unverified-email error
- `commute-share/app/(auth)/role.tsx` -- driver / passenger / both selection (unchanged logic)
- `commute-share/app/(auth)/profile.tsx` -- avatar upload only (username already set at registration)
- `commute-share/app/(auth)/licence.tsx` -- driver licence upload + pending state (unchanged logic)
- `commute-share/app/(app)/_layout.tsx` -- main app navigator stub
- `commute-share/app/(app)/index.tsx` -- home screen: username, role chip, verification badge
- `commute-share/supabase/migrations/001_profiles.sql` -- profiles table + check_availability RPC + RLS
- `commute-share/supabase/migrations/002_driver_verifications.sql` -- verifications table + storage buckets + RLS

## Tasks & Acceptance

**Execution:**
- [x] `lib/supabase.ts` -- conditional storage adapter: `SecureStore` on native, `localStorage` on web (same pattern as previous iteration) -- required by all screens
- [x] `lib/auth.ts` -- `register(username, email, password, phone)`: calls `check_availability` RPC for username + phone then `supabase.auth.signUp`; `login(email, password)`: `supabase.auth.signInWithPassword`; `verifyEmailOtp(email, token)`: `supabase.auth.verifyOtp({ type:'signup' })`; `resendVerificationEmail(email)`: `supabase.auth.resend({ type:'signup' })`; `signOut()` -- keeps screens thin
- [x] `supabase/migrations/001_profiles.sql` -- create `profiles(id uuid PK references auth.users, username text unique not null, phone text unique, avatar_url text, role text check(...), created_at timestamptz)`; RLS own-row policies (select/insert/update/delete); `check_availability(field_name text, field_value text) returns boolean` SECURITY DEFINER RPC (callable unauthenticated) -- core identity schema
- [x] `supabase/migrations/002_driver_verifications.sql` -- unchanged from previous iteration (driver_verifications table + avatars/licences storage buckets + RLS) -- driver verification schema
- [x] `app/_layout.tsx` -- on session resolve: if no session → `/(auth)/login`; if session → query `profiles.select('role')` for this user; if role set → `/(app)`; if no row or role null → `/(auth)/role` -- routing correctness for both new and returning users
- [x] `app/(auth)/register.tsx` -- four fields: username (unique handle, alphanumeric+underscore), email, password (min 8, show/hide toggle), phone (E.164 with +36 prefill); on submit: call `register()`, handle duplicate errors inline; navigate to `/(auth)/verify-email` on success -- registration entry
- [x] `app/(auth)/verify-email.tsx` -- 6-digit OTP input, 10-min countdown, disable + Resend after 3 wrong or expiry; call `verifyEmailOtp()`; on success navigate to `/(auth)/role` (not root-layout-dependent) -- email verification
- [x] `app/(auth)/login.tsx` -- email + password; call `login()`; handle "Email not confirmed" with Resend link; generic error for wrong credentials; navigate to `/(app)` on success (root layout will handle incomplete-profile redirect) -- returning user entry
- [x] `app/(auth)/role.tsx` -- three-option selector (Driver / Passenger / Both); upsert `profiles.role`; navigate to `/(auth)/profile` -- role establishment
- [x] `app/(auth)/profile.tsx` -- avatar upload only (no display name field); upsert `profiles.avatar_url`; if role includes driver → `/(auth)/licence`; else → `/(app)` -- avatar step
- [x] `app/(auth)/licence.tsx` -- image picker → private `licences` bucket → insert `driver_verifications` row; navigate to `/(app)` -- driver verification trigger
- [x] `app/(app)/index.tsx` -- fetch username + role + latest verification status; show username, role chip, verification badge (pending/approved/rejected), "No licence submitted" fallback for unverified drivers -- confirms full flow

**Acceptance Criteria:**
- Given valid registration fields with no duplicates, when submitted, then a Supabase account is created, an OTP email is sent, and the verify-email screen is shown.
- Given a duplicate phone at registration, when submitted, then an inline error "Number already registered" is shown and no account is created.
- Given a duplicate email at registration, when submitted, then an inline "Email already in use" error is shown and no account is created.
- Given a correct email OTP, when entered, then a session is created and the user is navigated to role selection.
- Given three consecutive wrong OTP entries, when the third fails, then input is disabled and only the Resend button is shown.
- Given valid email + password at login and a complete profile, when submitted, then the user lands on the home screen.
- Given valid email + password at login and no role set, when submitted, then the user is routed to role selection.
- Given wrong credentials at login, when submitted, then a generic "Incorrect email or password" error is shown.
- Given role = Driver or Both, when avatar step completes, then the licence upload screen is shown.
- Given a valid stored session with complete profile, when the app is opened, then the user lands on the home screen without re-authenticating.
- Given no session, when the app is opened, then the login screen is shown.

## Spec Change Log

- **2026-06-12 (loop 1):** Auth approach changed from phone-OTP-only to email+password+username after review revealed: (a) Supabase phone OTP makes "duplicate phone" scenario unreachable (intent_gap); (b) user renegotiated — wants password-based auth, username as display handle, email OTP for verification, phone collected but SMS-verified later. Registration/login screens fully replaced. `profiles` schema updated to include `username` (unique), drop `display_name`. Added `check_availability` RPC for unauthenticated duplicate checks. Root layout routing fixed to distinguish new vs returning users (bad_spec A6 from first review). Patches from review loop 1 applied in this re-derivation: OTP timer dependency fix, concurrent-call guard, resend error surfacing, signOut error propagation, env-var startup assertion, phone-param null guard.

## Design Notes

- **`check_availability` RPC:** A `SECURITY DEFINER` Postgres function that checks username/phone uniqueness without exposing any user data. Called from the unauthenticated registration client before creating the auth account — prevents ghost accounts from being created when duplicates exist.
- **Email OTP type:** Use `type: 'signup'` in `verifyOtp` for new registrations. Supabase sends the OTP automatically when `signUp` is called with email confirmation enabled in the project settings.
- **Root layout profile check:** After session resolution, a single lightweight query `profiles.select('role').maybeSingle()` determines routing (role set → home, role null → onboarding). This adds one DB round-trip on cold start but is the only reliable way to distinguish new from returning users.
- **`localStorage` on web:** Sessions persist across page refreshes on web (unlike the previous in-memory fallback). Use `localStorage` availability check before accessing.

## Verification

**Commands:**
- `cd commute-share && npx expo start --web` -- expected: dev server starts, no TypeScript errors
- `npx tsc --noEmit` -- expected: 0 errors

**Manual checks:**
- Full registration: register → email OTP → role → avatar → (if driver) licence → home shows username + role + badge.
- Register with duplicate phone → inline error, no account created.
- Register with duplicate email → inline error.
- Sign out → login screen. Log in with email + password → home screen.
- Sign out, reopen app → login screen. Sign in, reopen app → home screen (no re-auth).

## Suggested Review Order

**Entry point — routing hub**

- Root layout: session guard + always-query profile completeness (AC-7 fix at line 57)
  [`_layout.tsx:46`](../../commute-share/app/_layout.tsx#L46)

**Auth library**

- `register()`: RPC duplicate check → signUp → identities heuristic for duplicate email
  [`auth.ts:8`](../../commute-share/lib/auth.ts#L8)

- `login()`: email-not-confirmed detection via code + message fallback
  [`auth.ts:54`](../../commute-share/lib/auth.ts#L54)

- Supabase client: `localStorage` guard for SSR safety + SecureStore adapter
  [`supabase.ts:16`](../../commute-share/lib/supabase.ts#L16)

**Database schema**

- `check_availability` SECURITY DEFINER RPC — anon-callable uniqueness check
  [`001_profiles.sql:34`](../../commute-share/supabase/migrations/001_profiles.sql#L34)

- Profiles table: `username unique not null`, nullable `phone unique`
  [`001_profiles.sql:5`](../../commute-share/supabase/migrations/001_profiles.sql#L5)

**Registration & verification screens**

- Registration form: four fields, per-field inline errors, regex email validation
  [`register.tsx:47`](../../commute-share/app/(auth)/register.tsx#L47)

- Email OTP screen: profile row insert after OTP success using `user_metadata`
  [`verify-email.tsx:50`](../../commute-share/app/(auth)/verify-email.tsx#L50)

- Login screen: `emailNotConfirmed` → resend link UX
  [`login.tsx:33`](../../commute-share/app/(auth)/login.tsx#L33)

**Onboarding & home**

- Avatar upload: mimeType-based extension (fixes Android content:// URIs), non-blocking warning
  [`profile.tsx:49`](../../commute-share/app/(auth)/profile.tsx#L49)

- Home screen: username, role chip, verification badge, `||` fallback for empty username
  [`index.tsx:48`](../../commute-share/app/(app)/index.tsx#L48)
