# Session Handoff — 2026-06-12

## Key Project Files

| File | Purpose |
|---|---|
| `_bmad-output/planning-artifacts/project-context.md` | Project vision, tech stack, all goals, key decisions |
| `_bmad-output/implementation-artifacts/sprint-status.yaml` | Current goal status and next steps |
| `_bmad-output/implementation-artifacts/spec-user-auth-verification.md` | Goal 1 full spec (frozen intent + tasks + acceptance criteria) |
| `_bmad-output/implementation-artifacts/deferred-work.md` | Goals 2–7 descriptions |
| `_bmad-output/brainstorming/brainstorming-session-2026-06-11-1400.md` | Original product brainstorming |

---

## Where We Left Off

**Workflow position:** bmad-quick-dev → step-02 Checkpoint 1

The Goal 1 spec has been fully written (second iteration, after auth approach pivot). It is sitting at Checkpoint 1 waiting for user approval before implementation begins.

**Spec file:** `_bmad-output/implementation-artifacts/spec-user-auth-verification.md`
**Spec status:** `draft` (intentional — `done` only after implementation + review pass)

---

## Exact Next Action to Resume

**Resume by running `/bmad-quick-dev` and saying:**
> "Resume from Checkpoint 1. The spec at `_bmad-output/implementation-artifacts/spec-user-auth-verification.md` is ready for my review."

Then respond with `[A] Approve` or `[E] Edit` to proceed.

---

## What Checkpoint 1 Requires

Present the spec summary to the user, then:
- `[A] Approve` → proceed to step-03 (implementation)
- `[E] Edit` → go back to step-02 and revise

The spec summary is already in the conversation (the table shown before the user asked to save). No need to re-derive it.

---

## What Implementation (step-03) Must Do

After approval, the implementation agent must do these in order:

### Delete (old phone-OTP screens — replaced)
- `commute-share/app/(auth)/phone.tsx`
- `commute-share/app/(auth)/otp.tsx`

### Replace (files exist, content changes completely)
- `commute-share/lib/supabase.ts` — swap in-memory web fallback for `localStorage`; add env-var startup assertion
- `commute-share/lib/auth.ts` — new functions: `register`, `login`, `verifyEmailOtp`, `resendVerificationEmail`, `signOut`
- `commute-share/app/_layout.tsx` — session guard + `profiles.select('role')` completeness check
- `commute-share/app/(auth)/profile.tsx` — avatar upload only (remove display_name field)
- `commute-share/app/(app)/index.tsx` — show username + role chip + verification badge
- `commute-share/supabase/migrations/001_profiles.sql` — add `username text unique not null`; add `check_availability` RPC; remove `display_name`

### Create (new files)
- `commute-share/app/(auth)/register.tsx` — username + email + password + phone form
- `commute-share/app/(auth)/verify-email.tsx` — email OTP, 10-min countdown, 3-attempt lock
- `commute-share/app/(auth)/login.tsx` — email + password; handles unverified-email error
- `commute-share/app/(auth)/_layout.tsx` — auth stack navigator (may already exist, check first)
- `commute-share/app/(app)/_layout.tsx` — main app navigator stub (may already exist)

### Unchanged (do not modify)
- `commute-share/supabase/migrations/002_driver_verifications.sql`
- `commute-share/app/(auth)/role.tsx`
- `commute-share/app/(auth)/licence.tsx`

---

## Key Patches to Apply During Implementation

These were identified in review loop 1 and are already documented in the spec's Change Log:

1. **OTP timer**: Use a single `setInterval` in `useEffect(fn, [])` — do NOT put `secondsLeft` in the dependency array (causes exponential interval spawning)
2. **Concurrent-call guard**: Disable submit button while async call is in flight
3. **Resend error surfacing**: Show inline error if resend API call fails (don't silently swallow it)
4. **signOut error propagation**: Re-throw or surface errors from `supabase.auth.signOut()`
5. **Env-var startup assertion**: In `lib/supabase.ts`, throw/warn at module load time if `EXPO_PUBLIC_SUPABASE_URL` or `EXPO_PUBLIC_SUPABASE_ANON_KEY` are missing
6. **Phone param null guard**: In `register()`, handle the case where phone is empty string before calling RPC

---

## Key Technical Decisions (for context)

| Decision | Choice | Reason |
|---|---|---|
| Auth method | Email + password | User renegotiated; phone OTP has no duplicate-detection on Supabase |
| Username | Display handle only, never login credential | User's explicit requirement |
| Phone verification | Collected at signup, SMS-verified in Goal 2+ | Twilio costs; keep MVP lean |
| Duplicate checks | `check_availability` SECURITY DEFINER RPC | Unauthenticated clients can't query `profiles` directly |
| Web session storage | `localStorage` | In-memory fallback loses session on page refresh |
| OTP verification type | `type: 'signup'` in `verifyOtp` | Supabase requirement for email confirmation flow |
| Root layout routing | Query `profiles.role` after session resolve | Only reliable way to distinguish new vs returning users |

---

## File Inventory (Goal 1 scope)

```
commute-share/
├── lib/
│   ├── supabase.ts          [REPLACE]
│   └── auth.ts              [REPLACE]
├── app/
│   ├── _layout.tsx          [REPLACE]
│   ├── (auth)/
│   │   ├── _layout.tsx      [CREATE or verify exists]
│   │   ├── phone.tsx        [DELETE]
│   │   ├── otp.tsx          [DELETE]
│   │   ├── register.tsx     [CREATE]
│   │   ├── verify-email.tsx [CREATE]
│   │   ├── login.tsx        [CREATE]
│   │   ├── role.tsx         [UNCHANGED]
│   │   ├── profile.tsx      [REPLACE - avatar only]
│   │   └── licence.tsx      [UNCHANGED]
│   └── (app)/
│       ├── _layout.tsx      [CREATE or verify exists]
│       └── index.tsx        [REPLACE]
└── supabase/
    └── migrations/
        ├── 001_profiles.sql             [REPLACE]
        └── 002_driver_verifications.sql [UNCHANGED]
```

---

## Acceptance Criteria (copy from spec for quick reference)

- Valid registration → Supabase account created, OTP email sent, verify-email screen shown
- Duplicate phone → "Number already registered" inline error, no account created
- Duplicate email → "Email already in use" inline error, no account created
- Correct OTP → session created, navigate to role selection
- 3 wrong OTPs → input disabled, only Resend shown
- Valid login + complete profile → home screen
- Valid login + no role → routed to role selection
- Wrong credentials → "Incorrect email or password" (generic)
- Role = Driver or Both + avatar done → licence screen shown
- Valid session + complete profile on app open → home screen (no re-auth)
- No session on app open → login screen

---

## Verification Commands (run after implementation)

```bash
cd commute-share && npx expo start --web   # dev server starts, no TS errors
npx tsc --noEmit                           # 0 TypeScript errors
```
