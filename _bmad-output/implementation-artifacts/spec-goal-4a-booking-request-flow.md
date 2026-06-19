---
title: 'Goal 4a — Booking Request Flow'
type: 'feature'
created: '2026-06-19'
status: 'done'
baseline_commit: '37b673e18bbcc5c9b386e144f3bbce2574d6e5ef'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Passengers can discover matching routes but cannot request a ride, and drivers have no way to receive or respond to requests. Result cards also show no driver identity, making trust impossible before booking.

**Approach:** Add a `bookings` table with RLS, make driver usernames immutable via a DB trigger, surface the driver's username on discovery cards, add a "Request Ride" CTA, and build a My Rides screen where both roles can view and act on booking state.

## Boundaries & Constraints

**Always:**
- `username` immutability is enforced by a PostgreSQL BEFORE UPDATE trigger — not app-layer only. Raise an exception if `NEW.username IS DISTINCT FROM OLD.username`.
- `driver_id` is denormalized onto `bookings` at INSERT (copied from `routes.driver_id`) to keep RLS simple.
- Valid status transitions only: `pending → confirmed`, `pending → declined`, `pending/confirmed → cancelled`. No other transitions.
- A passenger cannot book their own route (guard in `validateBookingRequest` + RLS `passenger_id != driver_id` check).
- Duplicate pending booking for the same route by the same passenger is blocked (unique constraint + guard).

**Ask First:**
- If RLS for the driver's booking query requires a service-role RPC instead of a direct client query, halt and confirm before adding Edge Functions.

**Never:**
- No payment, deposit, or wallet logic (Goal 4c).
- No cancellation windows or penalty logic (Goal 4b).
- No push notifications or in-app chat (Goal 6).
- No trusted-pair fast-track (Goal 4c).
- No seat count or capacity management.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Happy path — request | Passenger taps "Request Ride" on an active route they don't own | Booking row inserted with `status = pending`; button updates to "Pending" | — |
| Duplicate request | Pending booking already exists for this passenger + route | "Request Ride" button is disabled / shows "Pending" on mount | No second row inserted; show "Already requested" |
| Own route guard | User with role=both opens Find Rides | Their own routes are excluded (existing RLS on routes table) | — |
| Driver accepts | Driver taps Accept on a pending booking | `status → confirmed`; passenger's My Rides reflects Confirmed | — |
| Driver declines | Driver taps Decline on a pending booking | `status → declined`; passenger's My Rides reflects Declined | — |
| Username change attempt | Any UPDATE to `profiles.username` | DB raises exception; update rejected at trigger layer | Client sees Supabase error; no silent overwrite |

</frozen-after-approval>

## Code Map

- `supabase/migrations/005_username_immutable.sql` — new: BEFORE UPDATE trigger on profiles raising exception on username change
- `supabase/migrations/006_bookings.sql` — new: bookings table + full RLS (passenger INSERT/SELECT, driver SELECT/UPDATE)
- `lib/routes.ts` — update: join `profiles!driver_id(username)` in `getActiveRoutesForDiscovery`; add `RouteWithDriver` type
- `lib/bookings.ts` — new: `validateBookingRequest` (pure), `createBookingRequest`, `getMyBookingsAsPassenger`, `getPendingRequestsForDriver`, `respondToBooking`
- `app/(app)/discover/index.tsx` — update: show driver username on cards; add "Request Ride" / "Pending" / "Confirmed" button states
- `app/(app)/bookings/index.tsx` — new: My Rides screen with Passenger / Driver segments
- `app/(app)/_layout.tsx` — update: add Bookings tab (`bookmark-outline` icon)
- `__tests__/bookings.test.ts` — new: unit tests for `validateBookingRequest` edge cases

## Tasks & Acceptance

**Execution:**
- [x] `supabase/migrations/005_username_immutable.sql` — create function + BEFORE UPDATE trigger on `profiles`: `IF NEW.username IS DISTINCT FROM OLD.username THEN RAISE EXCEPTION 'username is immutable'; END IF;`
- [x] `supabase/migrations/006_bookings.sql` — create `bookings` table: `id uuid PK`, `route_id uuid FK→routes`, `driver_id uuid FK→profiles`, `passenger_id uuid FK→profiles`, `status text CHECK(pending/confirmed/declined/cancelled)`, `requested_at timestamptz DEFAULT now()`, `confirmed_at timestamptz`, `passenger_note text`; UNIQUE(route_id, passenger_id); RLS: passenger INSERT (passenger_id=auth.uid(), passenger_id!=driver_id), SELECT own rows; driver SELECT where driver_id=auth.uid(), UPDATE status where driver_id=auth.uid()
- [x] `lib/routes.ts` — update `getActiveRoutesForDiscovery` to `select('*, profiles!driver_id(username)')`. Add `RouteWithDriver` type extending `Route` with `profiles: { username: string }`. Update return type accordingly.
- [x] `lib/bookings.ts` — implement `validateBookingRequest(userId: string, route: RouteWithDriver): { valid: boolean; reason?: string }` (pure: checks passenger != driver, route status active); implement async `createBookingRequest(routeId, driverId)`, `getMyBookingsAsPassenger(userId)`, `getPendingRequestsForDriver(userId)`, `respondToBooking(bookingId, status: 'confirmed'|'declined')`
- [x] `app/(app)/discover/index.tsx` — on mount load existing user bookings (by route_id) into a map for O(1) status lookup; render `route.profiles.username` on each card; wrap card in Pressable; show "Request Ride" / "Pending" / "Confirmed" / "Declined" button based on booking map status
- [x] `app/(app)/bookings/index.tsx` — new screen; segmented control Passenger / Driver; Passenger tab: list own bookings with route origin→dest, departure time, driver username, status badge; Driver tab: list pending requests with passenger username, route summary, Accept + Decline buttons that call `respondToBooking`
- [x] `app/(app)/_layout.tsx` — add `<Tabs.Screen name="bookings" options={{ title: 'My Rides', tabBarIcon: ({ color }) => <Ionicons name="bookmark-outline" size={24} color={color} /> }} />`
- [x] `__tests__/bookings.test.ts` — unit-test `validateBookingRequest`: own-route blocked, valid foreign route passes; integration-test stubs for status guard if pure helpers are added

**Acceptance Criteria:**
- Given a passenger views Find Rides, when routes load, then each card shows the driver's username below the route addresses.
- Given a passenger taps "Request Ride", when the booking is created successfully, then the button updates to "Pending" immediately (optimistic or on response) without a full list reload.
- Given a passenger with an existing pending booking reopens Find Rides, when cards render, then the relevant card shows "Pending" without a second request being creatable.
- Given a driver opens My Rides (Driver tab), when pending requests exist, then each shows passenger username, route origin→dest, and Accept / Decline buttons.
- Given a driver taps Accept or Decline, when confirmed, then the passenger's My Rides (Passenger tab) reflects the updated status on next load.
- Given any code attempts `UPDATE profiles SET username = 'x' WHERE id = $1`, when executed, then the DB raises an exception and the row is unchanged.
- Given `npm test` runs, when all suites execute, then 0 failures.

## Design Notes

**Username immutability at DB layer:** A BEFORE UPDATE row-level trigger is the only reliable enforcement — RLS UPDATE policies cannot distinguish which columns are changing. The trigger function is `SECURITY DEFINER` is not required; it runs as the calling role and simply raises before the write lands.

**Booking status on discover cards:** Load all of the current user's bookings once on mount (`getMyBookingsAsPassenger`), build a `Map<route_id, status>`, then reference it per card render. Avoids N per-card queries.

**driver_id denormalization:** Copied from `routes.driver_id` at INSERT time. Allows the driver's RLS SELECT policy (`driver_id = auth.uid()`) without a subquery join. App must pass `driver_id` explicitly when calling `createBookingRequest`.

## Verification

**Commands:**
- `cd commute-share && npx tsc --noEmit` — expected: 0 errors
- `cd commute-share && npm test` — expected: all tests pass, 0 failures

## Suggested Review Order

**Database: schema, RLS, and safety invariants**

- Bookings table: columns, RLS (4 policies), partial unique index for re-request support
  [`006_bookings.sql:1`](../../commute-share/supabase/migrations/006_bookings.sql#L1)

- BEFORE INSERT trigger auto-derives `driver_id` from routes — prevents client spoofing
  [`006_bookings.sql:50`](../../commute-share/supabase/migrations/006_bookings.sql#L50)

- BEFORE UPDATE trigger sets `confirmed_at := now()` server-side on `pending → confirmed`
  [`006_bookings.sql:65`](../../commute-share/supabase/migrations/006_bookings.sql#L65)

- Username immutability: BEFORE UPDATE trigger raises exception on any username change
  [`005_username_immutable.sql:6`](../../commute-share/supabase/migrations/005_username_immutable.sql#L6)

**Booking library (pure logic + CRUD)**

- `validateBookingRequest`: pure guard — own-route and inactive-route blocks
  [`bookings.ts:32`](../../commute-share/lib/bookings.ts#L32)

- `respondToBooking`: `.eq('status','pending')` prevents re-overwriting settled bookings
  [`bookings.ts:107`](../../commute-share/lib/bookings.ts#L107)

- `createBookingRequest`: client passes `driverId` but BEFORE INSERT trigger overrides it safely
  [`bookings.ts:47`](../../commute-share/lib/bookings.ts#L47)

**Discover screen — driver identity + booking interaction**

- Booking map built once from parallel load; `originalStatus` captured for safe rollback
  [`discover/index.tsx:332`](../../commute-share/app/(app)/discover/index.tsx#L332)

- `handleRequestRide`: optimistic update → createBookingRequest → status-preserving rollback
  [`discover/index.tsx:365`](../../commute-share/app/(app)/discover/index.tsx#L365)

- Driver username + 4-state button (Request / Pending / Confirmed / Request Again)
  [`discover/index.tsx:485`](../../commute-share/app/(app)/discover/index.tsx#L485)

**My Rides screen**

- Segment control, passenger booking list with status badges
  [`bookings/index.tsx:61`](../../commute-share/app/(app)/bookings/index.tsx#L61)

- Driver view: pending requests with Accept/Decline, refreshes after response
  [`bookings/index.tsx:143`](../../commute-share/app/(app)/bookings/index.tsx#L143)

**Routing, types, and tests**

- `RouteWithDriver` type: `Route & { profiles: { username } }` — drives the join contract
  [`routes.ts:22`](../../commute-share/lib/routes.ts#L22)

- 4th tab wired into layout (`bookmark-outline`, title "My Rides")
  [`_layout.tsx:44`](../../commute-share/app/(app)/_layout.tsx#L44)

- `validateBookingRequest` unit tests: 6 cases covering own-route, inactive, valid, priority, no-mutation
  [`bookings.test.ts:30`](../../commute-share/__tests__/bookings.test.ts#L30)
