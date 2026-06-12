# Deferred Work

Goals deferred from the commuter car-sharing app quick-dev session (2026-06-12).
Parent goal completed first: **Goal 1 — User auth & verification**

---

## Deferred Goals (in suggested implementation order)

### Goal 2 — Driver route setup
Maps API integration, corridor definition, detour tolerance settings, route posting UX.
Driver sets start + destination + preferred route; deep Google Maps API integration required.

### Goal 3 — Passenger ride discovery
Corridor-based matching engine, ride browsing, map visualization of active corridors.
Smart filtering at scale (best 2–3 of 20+ matches shown). Social proof map before sign-up.

### Goal 4 — Ride booking & scheduling
Recurring + ad-hoc ride modes, trusted-pair fast-track (one-tap after established trust),
booking deposit logic, cancellation windows (12h free / last 2–3h penalised), no-show handling.

### Goal 5 — Payment system
Card-first Stripe integration, distance-scaled fare calculation, 5% platform cut,
in-app wallet unlocked after 10 successful rides, multi-passenger discount (~20% per added passenger).

### Goal 6 — Communication & safety
Ride-scoped in-app chat, cold-outreach with accept/deny gating, post-confirmation phone number exchange,
passive arrival check (auto-ping if no activity X min after ETA), panic button (live location broadcast).

### Goal 7 — Ratings & reputation
3-point rating scale (bad/neutral/good) + free-text platform feedback,
multi-dimensional rating dimensions (punctuality, reliability, friendliness, communication, driving skill, attitude),
blue-check progressive unlock tied to ride count and profile completeness.

---

## Implementation-Level Deferred Items (Goal 1 review)

**C-1** — `check_availability` anon grant enables username/phone enumeration. By spec design; consider rate-limiting if it becomes an attack surface.

**EC-6** — OTP countdown is client-side. Drifts from Supabase server-side expiry. Cosmetic only; server rejects expired codes regardless.

**EC-8** — Double session check on cold start (`getSession` + `onAuthStateChange`). Idempotent; no functional impact. Add a ref guard if DB round-trips become a concern.

**m-1** — `isE164` / `isValidUsername` are local to `register.tsx`. Move to `lib/validators.ts` if a second screen needs them.

**m-4** — No phone normalization (spaces/dashes not stripped). E.164 regex guards format; normalization is polish.

**m-5** — `profiles.role` nullable with no DB constraint enforcing completion. App-level routing is sufficient for now.

**M-3** — Duplicate email detection uses undocumented `identities.length === 0` sentinel. Replace when Supabase exposes an official error code.

**ENV** — env-var assertion fires in prod builds too. Non-fatal; tighten to `throw` in dev only when convenient.
