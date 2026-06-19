---
title: 'Goal 3 — Passenger Ride Discovery'
type: 'feature'
created: '2026-06-15'
status: 'done'
baseline_commit: 'a7dd18a57462297f1d1eeb98a74c3cc011bdecd1'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Passengers have no way to find driver routes that overlap their commute. The app only lets drivers manage routes; there is no discovery mechanism for the passenger side.

**Approach:** Add a "Find Rides" tab where passengers enter origin and destination via Places autocomplete; the app fetches all active driver routes (excluding the user's own), runs client-side point-proximity corridor matching using each route's encoded polyline and `detour_tolerance_km`, and renders a filtered results list.

## Boundaries & Constraints

**Always:**
- Matching logic: both the passenger's origin AND destination must be within `detour_tolerance_km` (km) of the nearest point on the driver's encoded polyline (Haversine, point-iteration — not segment projection).
- Use Places API (New) POST autocomplete (same headers/body pattern as `routes/new.tsx`).
- Exclude the requesting user's own routes from results (`driver_id != auth.uid()` in both RLS and the query).
- New DB migration required: RLS SELECT policy for authenticated passengers on the `routes` table.
- No MapView, no `react-native-maps` in this goal — purely list-based UI.

**Ask First:**
- Any change to `profiles` RLS that would expose phone numbers to other users.
- Moving matching logic server-side (Supabase RPC or Edge Function).

**Never:**
- Booking, contacting the driver, or any transactional action (Goal 4).
- Map visualization of corridors or matched routes (deferred per user decision).
- Social proof / unauthenticated discovery screen (deferred per user decision).
- PostGIS or any geospatial DB extension.
- Schedule-day or time-of-day filter UI (deferred — show all corridor matches, let user read schedule from the card).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Matches found | Valid origin + dest selected; ≥1 active route within corridor | Non-empty list of route cards | N/A |
| No matches | Valid origin + dest; no active route within corridor | Empty state: "No rides found for this route" | N/A |
| Incomplete input | Only one field filled | Search button disabled | N/A |
| Autocomplete fetch fails | Network error during suggestions | Suggestions list silently clears; user can re-type | No crash, no error toast |
| Empty database | No active routes at all | Empty state (same as no matches) | N/A |
| Passenger is also a driver | User's own route would otherwise match | Own route NOT shown | Excluded by `driver_id != userId` filter |

</frozen-after-approval>

## Code Map

- `supabase/migrations/003_routes.sql` — existing `routes` table schema; owner-only RLS (SELECT, INSERT, UPDATE, DELETE all check `auth.uid() = driver_id`)
- `supabase/migrations/004_routes_rls_passenger.sql` — new migration: adds passenger SELECT policy
- `lib/routes.ts` — `LatLng` type defined here; add `getActiveRoutesForDiscovery`
- `lib/matching.ts` — new file: polyline decode + Haversine + corridor match predicate
- `app/(app)/_layout.tsx` — tab bar; add third "Find Rides" tab
- `app/(app)/discover/index.tsx` — new screen: autocomplete inputs, search, results list
- `app/(app)/routes/index.tsx` — reference for the list + four-state render pattern to mirror

## Tasks & Acceptance

**Execution:**
- [x] `supabase/migrations/004_routes_rls_passenger.sql` -- CREATE; add `CREATE POLICY "Passengers can discover active routes" ON routes FOR SELECT USING (status = 'active' AND driver_id != auth.uid());` — existing owner-only policy covers driver's own view; new policy covers passenger discovery; Supabase ORs them
- [x] `lib/matching.ts` -- CREATE; export `decodePolyline(encoded: string): LatLng[]` (standard Google polyline algorithm: chunks of ASCII chars, offset −63, accumulate zigzag-decoded deltas), `haversineKm(a: LatLng, b: LatLng): number` (Earth radius 6371 km), `minDistanceToPolylineKm(point: LatLng, pts: LatLng[]): number` (min over all pts), `matchesPassengerCorridor(origin: LatLng, dest: LatLng, route: Route): boolean` (both origin and dest within `route.detour_tolerance_km`)
- [x] `lib/routes.ts` -- ADD `getActiveRoutesForDiscovery(userId: string): Promise<Route[]>`; query `routes` where `status = 'active'` and `driver_id != userId`; return all columns; throw on Supabase error
- [x] `app/(app)/discover/index.tsx` -- CREATE; two Places autocomplete inputs (origin, destination) reusing the fetch pattern from `routes/new.tsx` verbatim; "Search" button disabled until both fields resolved to a `LatLng`; on Search: call `getActiveRoutesForDiscovery`, run `matchesPassengerCorridor` client-side, set results; render four states: loading / error+retry / empty-state / results list; each result card shows: `origin_address → destination_address`, departure time (HH:MM), schedule days (M/Tu/W/Th/F/Sa/Su abbreviation, same as routes list), `detour_tolerance_km` ± label; no tap action on cards
- [x] `app/(app)/_layout.tsx` -- ADD third tab: `name="discover"`, `title="Find Rides"`, icon `search-outline` (Ionicons), `headerShown: true`; insert between index and routes tabs or after routes — place after routes

**Acceptance Criteria:**
- Given user opens Find Rides tab, when neither field is filled, then Search button is disabled and shows no results
- Given both origin and destination are selected via autocomplete, when Search is tapped, then matching active routes (not the user's own) are displayed as cards
- Given Search is tapped and no routes match the corridor, when the results list would be empty, then the screen shows "No rides found for this route"
- Given the signed-in user has their own active route that would geometrically match the search, when Search is tapped, then that route does NOT appear in results
- Given `npx tsc --noEmit` is run after implementation, then it exits with zero errors

## Spec Change Log

## Design Notes

**Polyline decode:** The standard Google Encoded Polyline algorithm processes the string in chunks: read bytes until you find one with bit 5 unset (value < 32 after subtracting 63); accumulate a 5-bit–per-byte little-endian int; apply zigzag decode (right-shift 1, negate if bit 0 was set); divide by 1e5 to get degrees; accumulate as delta from previous point. Both lat and lng are encoded in sequence. There are clean 10-line implementations freely available — implement from the algorithm description, not from a library.

**Corridor matching iteration:** Iterate the decoded polyline array and compute Haversine distance from the query point to each vertex. Return the minimum. This is slightly less precise than segment-based projection but is adequate at typical urban polyline density (one vertex per 10–50 m) and avoids the perpendicular-foot edge cases.

## Verification

**Commands:**
- `npx tsc --noEmit` -- expected: no errors, clean exit
- `npm test` -- expected: 23 tests pass (`__tests__/matching.test.ts`)

**Manual checks (if no CLI):**
- Log in as dev user (role: both); navigate to Find Rides tab — tab should appear in bottom bar
- Enter an origin and destination that overlaps a saved driver route; tap Search — route card should appear
- Enter an origin/destination that doesn't match anything; tap Search — empty state shown
- Confirm the dev user's own route (if any) is absent from results

## Suggested Review Order

**Database access control**

- New RLS SELECT policy — gates passenger discovery to active routes only, excludes own
  [`004_routes_rls_passenger.sql:9`](../../commute-share/supabase/migrations/004_routes_rls_passenger.sql#L9)

**Matching algorithm**

- Entry point: corridor predicate — combines decode + Haversine + tolerance check
  [`matching.ts:82`](../../commute-share/lib/matching.ts#L82)

- Polyline decoder — standard Google zigzag algorithm, delta-accumulates lat/lng pairs
  [`matching.ts:12`](../../commute-share/lib/matching.ts#L12)

- Haversine distance — Earth radius 6371 km, used for vertex proximity
  [`matching.ts:54`](../../commute-share/lib/matching.ts#L54)

**Data fetching**

- `getActiveRoutesForDiscovery` — Supabase query: active routes excluding caller's own
  [`routes.ts:52`](../../commute-share/lib/routes.ts#L52)

**Discovery screen**

- `handleSearch` — stale-request guard, auth check, fetch + client-side filter
  [`discover/index.tsx:306`](../../commute-share/app/(app)/discover/index.tsx#L306)

- `fetchSuggestions` — Places API (New) POST autocomplete, same pattern as routes/new.tsx
  [`discover/index.tsx:36`](../../commute-share/app/(app)/discover/index.tsx#L36)

- Render output — four states: loading / error+retry / empty-state / results cards
  [`discover/index.tsx:340`](../../commute-share/app/(app)/discover/index.tsx#L340)

**Navigation**

- Third tab registration — `discover` after routes, search-outline icon
  [`_layout.tsx:36`](../../commute-share/app/(app)/_layout.tsx#L36)
