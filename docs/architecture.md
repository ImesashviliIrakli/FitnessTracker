# Architecture

```
            Browser (PWA)
  ┌──────────────────────────────┐     fittrack-web   nginx:alpine :80 (frontend/Dockerfile)
  │ app.example.com              ├────► static SPA, SPA fallback, security headers
  │                              │
  │  fetch(credentials: include, │     fittrack-api   ASP.NET Core 10 :8080 (backend/FitnessTracker.Api/Dockerfile)
  │        X-CSRF: 1) ───────────┼────► Minimal APIs, Identity cookie, /health, migrates on startup
  └──────────────────────────────┘                │
                                                  ▼
                                           PostgreSQL
```

Two independently built images; the API never serves the SPA. Locally both run without Docker (`dotnet run`, `npm run dev`) against a local Postgres.

## Backend

**Vertical slice architecture** in one project (`backend/FitnessTracker.Api`). Each file in `Features/` owns its request/response records, FluentValidation validators and endpoint mappings. With ~12 entities and per-entity rules, layered Clean Architecture would triple the file count without protecting any invariant. If domain logic grows (e.g. programs/periodisation), extract a Domain project then.

| Folder | Contents |
|---|---|
| `Data/` | EF Core entities, `AppDbContext` (Identity + data-protection keys), seed library of ~40 exercises with MET values, migrations |
| `Common/` | Pure fitness math (`Metrics`), validation filter, CSRF middleware, unique-violation → 409 handler |
| `Features/` | `Auth`, `Profile` (+goals), `Body` (weights, measurements, CSV), `Daily`, `Training` (exercises, workouts, templates, records), `Dashboard`, `Calculator`, `Account` (export, delete) |

### Decisions and trade-offs

- **Cookie auth, not bearer tokens.** Identity sets an `HttpOnly; Secure; SameSite=Lax` cookie on the API host. JavaScript never sees a token. This requires the web and API to share a registrable domain (`app.` and `api.` of one domain), which is also why `Lax` is enough.
- **CSRF via required custom header.** Every unsafe request must send `X-CSRF: 1`. Browsers can only add that header cross-origin after a CORS preflight, which the policy rejects for unknown origins. Simpler than antiforgery token round-trips and equally strong for a JSON API (OWASP "custom request headers").
- **Data-protection keys in Postgres** so auth cookies survive restarts and redeploys, and are covered by DB backups.
- **Metric-only storage and API.** Unit conversion lives in one frontend module. No mixed-unit data can exist.
- **Derived values are computed, not stored**: BMI, lean mass, e1RM (Epley, 1–12 reps), volume, pace, MET calories, streaks. They never drift out of sync.
- **Workouts are saved as a whole aggregate** (PUT replaces exercises and sets). Matches how the editor works and avoids a dozen fine-grained endpoints.
- **Templates store their items as jsonb** — they are only ever read whole.
- **Deletion:** everything user-owned cascades from `AspNetUsers`; workouts are deleted first inside the same transaction because Postgres checks the workout → exercise FK per cascade step.
- **Migrations** apply on API startup (the database is created if missing). Keep them expand-only so rolling back to the previous image still works against the newer schema.
- **Personal records** are aggregated in memory per user. Fine for years of training data; move to a SQL window query if a user ever has hundreds of thousands of sets (marked `ponytail:` in code).

### Cross-cutting

ProblemDetails for all errors, FluentValidation with camelCase field keys (the SPA maps them onto form fields), rate limiting (10/min/IP on auth, 300/min per user elsewhere), forwarded headers for Traefik, HSTS outside development, Serilog (compact JSON in containers), OpenTelemetry traces/metrics (exported only when `OTEL_EXPORTER_OTLP_ENDPOINT` is set), health checks (`/health` includes the DB, `/health/live` does not), OpenAPI + Scalar in Development.

## Frontend

See [frontend.md](frontend.md). API URL via the `VITE_API_BASE_URL` build arg, TanStack Query, React Router, RHF + Zod, Tailwind v4, Recharts, PWA with an offline app shell and network-first caching of API GETs.

## Data model

```
AspNetUsers (AppUser: profile + current goal)
 ├─ WeightEntries       (UserId, Date) unique
 ├─ MeasurementEntries  (UserId, Date) unique
 ├─ DailyLogs           PK (UserId, Date)         steps, sleep, RHR, energy/soreness/mood
 ├─ Exercises           UserId null = built-in library
 ├─ Workouts ── WorkoutExercises (Position, SupersetGroup) ── WorkoutSets (Position, reps, kg, RPE, RIR, rest, tempo, duration, distance, HR, warm-up)
 └─ Templates           Exercises: jsonb [{exerciseId, sets, reps, weightKg}]
DataProtectionKeys
```

## Scope: no food or drink tracking

There is intentionally no meal, recipe, calorie-intake, water, alcohol, caffeine, grocery or food-database feature anywhere. The calorie calculator only *estimates a target* (Mifflin-St Jeor, or Katch-McArdle when body fat is known × activity multiplier ± a goal adjustment of 7700 kcal/kg), clamps to a 1200/1500 kcal floor, and shows safety warnings.

## Roadmap

| | Features |
|---|---|
| **MVP (built)** | Auth, profile, units, goals; weight/body-fat/BMI/lean mass; measurements; strength + cardio + mobility + sport logging with RPE/RIR/rest/tempo/supersets; templates; PRs, e1RM, volume, weekly streaks; daily recovery check-in; dashboard; calorie target calculator + macros; JSON/CSV export; account deletion; PWA shell |
| **Next** | Progress photos (S3-compatible storage, private, signed URLs); workout calendar + planned schedules and rest days; routines (multi-day programs); CSV/JSON import; body-part volume breakdown; recovery trends on the dashboard; email confirmation + password reset (needs an SMTP provider) |
| **Later** | Badges/achievements; circuits with timers and a rest timer; offline write queue with sync; wearable imports (Apple Health / Google Fit / Garmin exports — activity and heart rate only); 2FA; per-exercise progression suggestions |
