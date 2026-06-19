# Project Context — Commuter Rideshare App

## Vision

A commuter car-sharing mobile app for regular, short-distance urban commuters (suburb-to-city-center).
Budapest-first launch. Mission-driven, not greed-driven: 5% platform cut, no surge pricing.

**Core problem solved:** Solo driving is a hard daily habit to break. The app targets the habitual commuter who takes the same route every workday — matching them with a reliable driver they can trust and repeat.

## Target Audience

- Primary: office workers commuting from Budapest suburbs (e.g. Budaörs, Érd, Dunakeszi) to city center
- Secondary: drivers with empty seats on fixed daily routes who want to offset fuel costs
- Trust model: "blue check" progressive verification (ride count + profile completeness) rather than one-time ID verification

## Business Model

- 5% platform cut per ride
- In-app wallet unlocked after 10 successful rides (reduces payment friction for trusted users)
- Multi-passenger discount (~20% per added passenger beyond first)
- No surge pricing, no hidden fees

## Tech Stack (decided 2026-06-12)

| Layer | Choice | Notes |
|---|---|---|
| Mobile | React Native + Expo SDK 56 (TypeScript) | File-based routing via Expo Router |
| BaaS | Supabase | Auth, PostgreSQL + RLS, file storage |
| Maps | Google Maps via `react-native-maps` | Goal 2+ |
| Payments | Stripe | Goal 5 |
| Testing | Jest + ts-jest (`npm test`) | Unit tests for pure logic; browser-based for UI |

**App folder:** `commute-share/` in project root

## Implementation Goals (in order)

| # | Goal | Status | Spec |
|---|---|---|---|
| 1 | User auth & verification | **Done** | `_bmad-output/implementation-artifacts/spec-user-auth-verification.md` |
| 2 | Driver route setup | **Done** | `_bmad-output/implementation-artifacts/spec-goal-2-driver-route-setup.md` |
| 3 | Passenger ride discovery | **Done** | `_bmad-output/implementation-artifacts/spec-goal-3-passenger-ride-discovery.md` |
| 4a | Booking request flow | **Done** | `_bmad-output/implementation-artifacts/spec-goal-4a-booking-request-flow.md` |
| 4b | Cancellation & no-show | Deferred | `_bmad-output/implementation-artifacts/deferred-work.md` |
| 4c | Trusted-pair & deposit | Deferred | `_bmad-output/implementation-artifacts/deferred-work.md` |
| 5 | Payment system | Deferred | `_bmad-output/implementation-artifacts/deferred-work.md` |
| 6 | Communication & safety | Deferred | `_bmad-output/implementation-artifacts/deferred-work.md` |
| 7 | Ratings & reputation | Deferred | `_bmad-output/implementation-artifacts/deferred-work.md` |

## Goal 1 — Auth Design Decisions

**Decided 2026-06-12 after renegotiation:**

- Registration: username (unique in-app display handle) + email + password + phone (E.164, +36 prefill)
- Login: email + password only — username is never a login credential
- Email OTP for verification at signup (Supabase sends automatically on `signUp`)
- Phone collected at registration but SMS-verified later (Goal 2+, requires paid Twilio)
- Duplicate username/phone/email each produce distinct inline errors; no account created if any duplicate exists
- Phone uniqueness pre-checked via `check_availability` Supabase SECURITY DEFINER RPC (callable unauthenticated)
- Session storage: `expo-secure-store` on native, `localStorage` on web

**Rationale for phone OTP deferral:** Supabase phone OTP (Twilio) is a paid service; also, Supabase doesn't return "already registered" errors for phone OTP — it silently sends OTP to any number, making the duplicate-phone error scenario unreachable with that approach.

## Goal 2 — Driver Route Setup Design Decisions

**Completed 2026-06-15 (commit 54cd363):**

- **Corridor representation:** origin/dest lat-lng + Google Directions `overview_polyline` (encoded text) + `detour_tolerance_km` (spatial corridor width) + `detour_tolerance_min` (max acceptable duration increase). Both tolerances needed for Goal 3 matching.
- **detour_tolerance_min default:** `Math.max(1, Math.round(durationMin * 0.2))` — 20% of route's actual driving duration; fallback 10 min if Directions API fails.
- **schedule_days encoding:** `int[]` with 1=Mon…7=Sun (e.g. `[1,2,3,4,5]` for Mon–Fri). Displayed as M/Tu/W/Th/F/Sa/Su. Goal 4 uses this to generate recurring ride slots.
- **Cross-platform autocomplete:** Direct HTTP `fetch` to Google Places Autocomplete + Place Details endpoints (no native library). Works on iOS, Android, web.
- **MapView platform guard:** `react-native-maps` has no web support; all `MapView`/`Polyline` JSX wrapped in `Platform.OS !== 'web'`; web shows text "Origin → Destination" fallback.
- **app.config.js vs app.json:** `app.json` is static and cannot interpolate env vars. `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` is injected at build time via `app.config.js` (dynamic Expo config). Never put `$VAR` literals in `app.json`.
- **Soft-delete:** `deleteRoute` sets `status='deleted'`; list queries filter `.neq('status','deleted')`. Hard delete deferred.
- **Key file: `commute-share/lib/routes.ts`** — `fetchRouteDetails` returns `{ polyline, durationMin }` used by both the form preview and Goal 3 matching.

## Goal 4a — Booking Request Flow Design Decisions

**Completed 2026-06-19 (commit 5f7d33f):**

- **Goal 4 slicing:** Split into 4a (booking request flow), 4b (cancellation windows + no-show), 4c (trusted-pair fast-track + deposit). Each slice is independently shippable.
- **Username immutability:** Enforced by a PostgreSQL BEFORE UPDATE trigger (`005_username_immutable.sql`). Raises exception if `NEW.username IS DISTINCT FROM OLD.username`. DB-layer only — cannot be bypassed by app code or direct SQL.
- **`driver_id` on bookings:** Denormalized for RLS efficiency. A BEFORE INSERT trigger derives it server-side from `routes.driver_id` — client-supplied value is overridden, preventing spoofing.
- **Partial unique index:** `UNIQUE(route_id, passenger_id) WHERE status NOT IN ('declined','cancelled')` — allows passengers to re-request a seat after being declined (plain UNIQUE would permanently block re-requests).
- **`confirmed_at`:** Set by a BEFORE UPDATE trigger (`now()`) when status transitions to `confirmed`. Never set by the client to avoid clock skew.
- **Status transition guard:** `respondToBooking` adds `.eq('status','pending')` filter — a driver cannot re-overwrite a settled booking even with a stale UI call.
- **Booking map pattern:** `getMyBookingsAsPassenger` called once per search (parallel with route discovery), results stored in a `Map<route_id, status>` for O(1) per-card lookup. No per-card queries.
- **My Rides screen:** Segmented Passenger / Driver view. Driver segment hidden for `role = passenger`. Driver tab shows only `status = pending` requests (accepted/declined are terminal and visible to passenger only).
- **Key files:** `lib/bookings.ts` (all booking CRUD + pure `validateBookingRequest`), `app/(app)/bookings/index.tsx` (My Rides), `app/(app)/discover/index.tsx` (updated with driver username + request button).

## Key Product Decisions from Brainstorming

(Full session: `_bmad-output/brainstorming/brainstorming-session-2026-06-11-1400.md`)

- **Matching model:** Corridor-based (overlapping route segments), not point-to-point
- **Recurring + ad-hoc:** Both modes supported; one-tap re-booking for trusted pairs
- **Trust system:** Progressive blue-check unlock tied to ride count + profile completeness
- **Cancellation:** 12h before = free; last 2–3h = penalised (driver and passenger)
- **No-show handling:** Passive arrival check (auto-ping if no activity X min after ETA)
- **Safety:** Panic button with live location broadcast; post-confirmation phone exchange
- **Ratings:** 3-point scale (bad/neutral/good) + multi-dimensional dimensions per role

## BMAD Workflow

Using `bmad-quick-dev` skill for incremental implementation.
Each goal goes through: clarify → spec → implement → 3-reviewer review → present.
Tests (Jest unit tests for all new pure logic) are required as part of every goal's definition of done.

Current sprint tracker: `_bmad-output/implementation-artifacts/sprint-status.yaml`
