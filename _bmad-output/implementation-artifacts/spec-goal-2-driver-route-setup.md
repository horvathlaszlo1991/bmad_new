---
title: 'Goal 2 — Driver Route Setup'
type: 'feature'
created: '2026-06-15'
status: 'done'
baseline_commit: '518c9911e49198822ca710196524fab901aa7409'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Drivers cannot define their commute corridor in the app, blocking the corridor-based matching engine planned for Goal 3.

**Approach:** Add a "My Routes" tab (driver/both roles only) where a driver enters origin and destination via Google Places autocomplete, previews the route on a native map, sets detour tolerance and a weekly schedule, then saves the route to a new Supabase `routes` table.

## Boundaries & Constraints

**Always:**
- Only `profiles.role = 'driver' | 'both'` may create/view routes; passenger-only users see a role-prompt instead.
- Google Maps API key stored as `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` in `.env`; never hardcoded.
- Use Expo SDK 56-compatible library versions — consult https://docs.expo.dev/versions/v56.0.0/ before installing any package.
- All Supabase queries use the RLS-safe client; drivers CRUD only their own rows.
- TypeScript strict; `npx tsc --noEmit` must pass.

**Ask First:**
- If `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` is absent from the environment at implementation time, halt and ask the user before writing map-dependent code.

**Never:**
- Map rendering on web — gate all `MapView` usage behind `Platform.OS !== 'web'`; show static address text fallback instead.
- Real-time GPS tracking, turn-by-turn navigation, or route editing by dragging (Goal 6+).
- Passenger-facing discovery or matching logic (Goal 3).
- Native-only places/autocomplete library if a cross-platform HTTP approach is sufficient.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Post valid route | Origin + destination resolved, tolerance + schedule set | Route saved; appears in list | — |
| Address autocomplete | User types 3+ chars | Google Places Autocomplete results shown in dropdown | "No results" if API returns empty |
| Auto-calculated detour time | Both addresses resolved; Directions returns 20 min route | `detour_tolerance_min` pre-filled as 4 min (editable) | Falls back to 10 min if Directions call fails |
| Directions fetch fail | Google Directions API unreachable | Save is blocked; inline error shown | Retry button |
| Passenger accesses tab | `profiles.role = 'passenger'` | "Route posting is for drivers only" message | Link to update role |
| Network error on save | Supabase call throws | Inline error toast; form stays populated | — |
| No saved routes | Newly registered driver opens tab | Empty-state message + "Add Route" CTA | — |

</frozen-after-approval>

## Code Map

- `commute-share/supabase/migrations/003_routes.sql` — new routes table + RLS (new)
- `commute-share/lib/routes.ts` — CRUD wrappers + Directions API fetch (new)
- `commute-share/app/(app)/_layout.tsx` — add "Routes" tab
- `commute-share/app/(app)/routes/index.tsx` — route list screen (new)
- `commute-share/app/(app)/routes/new.tsx` — route creation form (new)
- `commute-share/app.config.js` — dynamic Expo config; resolves Google Maps API key from `process.env`
- `commute-share/.env.example` — add `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` entry

## Tasks & Acceptance

**Execution:**
- [x] `supabase/migrations/003_routes.sql` — create `routes` table: `id` (uuid PK default gen_random_uuid()), `driver_id` (uuid FK → profiles.id not null), `origin_address` (text not null), `origin_lat` (float8 not null), `origin_lng` (float8 not null), `destination_address` (text not null), `destination_lat` (float8 not null), `destination_lng` (float8 not null), `route_polyline` (text not null, encoded overview polyline from Directions API), `detour_tolerance_km` (int not null default 5), `detour_tolerance_min` (int not null default 10), `departure_time` (time not null), `schedule_days` (int[] not null, 1=Mon…7=Sun), `status` (text not null default 'active' check in ('active','paused','deleted')), `created_at` (timestamptz default now()). Enable RLS; owner policy: `auth.uid() = driver_id` on SELECT/INSERT/UPDATE/DELETE.
- [x] `app.config.js` — create alongside `app.json` as a dynamic Expo config (ES module `export default ({ config }) => ...`). Spread `config` as base, then override: `ios.config.googleMapsApiKey`, `android.config.googleMaps.apiKey`, and the `react-native-maps` plugin entry — all reading from `process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY`. Filter out any bare `"react-native-maps"` string from `config.plugins` before appending the configured `["react-native-maps", { ... }]` tuple. Keep `app.json` for all static values; do NOT put literal `"$EXPO_PUBLIC_..."` strings in `app.json`.
- [x] Install `react-native-maps` and `expo-location` at versions compatible with Expo SDK 56 (verify at https://docs.expo.dev/versions/v56.0.0/ before pinning). Record exact versions in `package.json`.
- [x] `lib/routes.ts` — export: `getMyRoutes(userId: string): Promise<Route[]>`, `createRoute(payload: RouteInsert): Promise<Route>`, `deleteRoute(routeId: string): Promise<void>`, `fetchRouteDetails(origin: LatLng, dest: LatLng): Promise<{ polyline: string; durationMin: number }>` (calls Google Directions HTTP API; returns `routes[0].overview_polyline.points` as `polyline` and `Math.round(routes[0].legs[0].duration.value / 60)` as `durationMin`). Define `Route` and `RouteInsert` TypeScript types matching the migration schema (include both `detour_tolerance_km` and `detour_tolerance_min`).
- [x] `app/(app)/_layout.tsx` — add a "Routes" tab (map-pin icon) that points to `routes/index`. The tab should render for all authenticated users; the role guard lives inside the screen itself.
- [x] `app/(app)/routes/index.tsx` — on mount: check `profiles.role`; if `passenger`, render locked-state message with link to Profile to update role. Otherwise: call `getMyRoutes`, render scrollable list of route cards (origin → destination, schedule days label, status chip). FAB / header "+" button navigates to `routes/new`. Empty state when no routes exist.
- [x] `app/(app)/routes/new.tsx` — multi-step creation form: (1) origin TextInput with live Google Places Autocomplete dropdown (HTTP endpoint, fires at 3+ chars, debounced 400 ms); (2) destination TextInput same; (3) once both are resolved, call `fetchRouteDetails` — on native render `MapView` with `Polyline` overlay; on web render plain text "Origin → Destination"; after the call, compute `detourMinDefault = Math.max(1, Math.round(durationMin * 0.2))` and pre-fill `detour_tolerance_min` with it (if `fetchRouteDetails` fails, fall back to 10); (4) detour tolerance km selector: options [1, 2, 5, 10, 20] km, default 5; detour tolerance min: numeric stepper (min 1, max 60), pre-filled from calculation above, always editable; (5) departure time picker + day-of-week checkboxes (Mon–Fri pre-checked); (6) "Save Route" button calls `createRoute()` then navigates back to index. Disable "Save" while fetch or save is in flight.

**Acceptance Criteria:**
- Given a driver is logged in, when the app loads, then a "Routes" tab is visible in the bottom navigation.
- Given a driver is on the route list with no routes, when the screen loads, then they see an empty-state message and an "Add Route" button.
- Given a driver types 3+ characters into the origin field, when the Places API responds, then a dropdown of autocomplete suggestions is displayed.
- Given both origin and destination are resolved on a native device, when `fetchRouteDetails` succeeds, then a `MapView` renders the driving route polyline between them.
- Given `fetchRouteDetails` returns a 20-minute route, when the form renders, then `detour_tolerance_min` is pre-filled as 4 (editable).
- Given a driver completes all fields and taps "Save Route", when the Supabase insert succeeds, then the new route appears in the list with correct addresses, days, and departure time.
- Given a user with `role: 'passenger'` opens the Routes tab, when the screen loads, then they see "Route posting is for drivers only" with a link to update their role — no route form is shown.

## Spec Change Log

**Iteration 1 — review loopback (2026-06-15)**
- **Finding:** `app.json` is static JSON; it does not interpolate `process.env` or `$VAR` strings at build time. The original task instructed adding Google Maps API keys to `app.json`, which caused the literal string `"$EXPO_PUBLIC_GOOGLE_MAPS_API_KEY"` to be baked into the native build — maps would silently receive the wrong key.
- **Amended:** Replaced the `app.json` task with an `app.config.js` task (dynamic Expo config where `process.env` is available).
- **Known-bad state avoided:** Native iOS/Android map SDK receiving literal `"$EXPO_PUBLIC_GOOGLE_MAPS_API_KEY"` instead of the real key.
- **KEEP:** All other files are verified correct — `003_routes.sql`, `lib/routes.ts`, `routes/_layout.tsx`, `routes/index.tsx`, `routes/new.tsx`, `app/(app)/_layout.tsx`. Do not re-derive these; only implement the `app.config.js` task and apply the review patches below.
- **Patches to apply in re-derivation:** (1) `lib/routes.ts`: guard `legs` array before accessing `legs[0]`. (2) `routes/new.tsx`: fix inline-retry missing `.finally`; fix Step-3 OR→AND condition; add `setDetourMin(10)` in manual retry `.catch`; add "No results" text in `AddressInput`; add HH:MM format validation before enabling save; add stale-request counter for autocomplete; show error feedback when `resolvePlace` fails; guard `decodePolyline` against empty-string polyline. (3) `routes/index.tsx`: fix day labels (Tu/Th/Sa/Su); fix retry to call full `load()` instead of bare `getMyRoutes`. (4) `app/(app)/_layout.tsx`: add `tabBarIcon` (map-pin) to Routes tab using `@expo/vector-icons`.

## Design Notes

**Corridor representation:** Origin/destination lat/lng + Google Directions `overview_polyline` (encoded) + `detour_tolerance_km` + `detour_tolerance_min`. Goal 3 uses both tolerances for matching: km defines the spatial corridor width; min defines the maximum acceptable trip duration increase. The polyline is stored as text and decoded client-side or in an Edge Function.

**Auto-calculated detour time default:** `Math.max(1, Math.round(durationMin * 0.2))` where `durationMin` comes from `routes[0].legs[0].duration.value / 60` in the Directions API response. The DB column defaults to 10 as a safe fallback if the fetch fails.

**Web map fallback:** `react-native-maps` has no web support. All `MapView` and `Polyline` JSX must be wrapped in a `Platform.OS !== 'web'` guard. The form, autocomplete HTTP calls, and Supabase save all work on every platform.

**Places Autocomplete strategy:** Call the Google Places Autocomplete HTTP endpoint (`https://maps.googleapis.com/maps/api/place/autocomplete/json`) directly via `fetch` with the API key. No native library required. Then call Place Details to resolve the selected place's lat/lng. This approach is consistent across iOS, Android, and web.

**Schedule days encoding:** Store as a sorted integer array (e.g. `[1,2,3,4,5]` for Mon–Fri). Display as abbreviated day labels ("M T W T F"). Goal 4 (booking) will use these to generate recurring ride slots.

## Verification

**Commands:**
- `npx tsc --noEmit` — expected: zero TypeScript errors

**Manual checks:**
- On a simulator/device: open Routes tab → add a route → confirm it appears in the list after save and persists after app reload.
- In Supabase dashboard: confirm the row exists in `routes` with correct `driver_id`, non-empty `route_polyline`, and `schedule_days` array.
- On web (`npm run web`): confirm the route creation form renders without crash and the map fallback text is shown instead of a MapView.

## Suggested Review Order

1. **Schema & types** — `../../commute-share/supabase/migrations/003_routes.sql:1`, `../../commute-share/lib/routes.ts:1`
2. **Service layer** — `../../commute-share/lib/routes.ts:29` (`getMyRoutes`/`createRoute`/`deleteRoute`), `../../commute-share/lib/routes.ts:68` (`fetchRouteDetails` + legs guard)
3. **Navigation shell** — `../../commute-share/app/(app)/_layout.tsx:2` (Ionicons + Routes tab), `../../commute-share/app/(app)/routes/_layout.tsx:1`
4. **Route list** — `../../commute-share/app/(app)/routes/index.tsx:1` (`load()` + `useFocusEffect`, passenger guard, day labels)
5. **Route creation form** — `../../commute-share/app/(app)/routes/new.tsx:1` (start); key anchors: `fetchSuggestions` (debounce + stale counter), `useEffect` on `[originPlace, destPlace]` (detourMin 20% calc), `canSave` guard, MapView platform guard, `decodePolyline`
6. **Config & peripherals** — `../../commute-share/app.config.js:1` (dynamic env key injection), `../../commute-share/app.json:1` (static values only), `../../commute-share/.env.example:1`
