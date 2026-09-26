# Fittrack

A self-hosted fitness tracker for **training, body metrics, weight and goals**, with a calorie *target* calculator.
It deliberately does **not** track food or drinks: no meals, recipes, intake, water, alcohol, caffeine or food databases.

- **Backend:** .NET 10, ASP.NET Core Minimal APIs (vertical slices), EF Core + PostgreSQL, Identity cookie auth, FluentValidation, ProblemDetails, Serilog, OpenTelemetry, rate limiting, health checks, OpenAPI/Scalar
- **Frontend:** React 19, TypeScript, Vite, TanStack Query, React Router, React Hook Form + Zod, Tailwind CSS v4, Recharts, PWA
- **Delivery:** two independent Docker images, `backend/FitnessTracker.Api/Dockerfile` and `frontend/Dockerfile` (each built with its own folder as the context)

## Features

- Profile with metric/imperial units and timezone; data export (JSON, weights CSV) and account deletion
- Weight, body fat, lean mass, BMI and a smoothed trend line; body measurements
- Strength, cardio, mobility and sport logging: sets, reps, weight, RPE/RIR, rest, tempo, warm-ups, supersets, duration, distance, pace, heart rate
- **Start Workout:** live sessions from a plan, a template or ad hoc, with targets (fixed, %1RM or last used), per-set logging, autosave across devices and a finish summary (PRs, streak)
- **Plan:** schedule templates on dates or as recurring weekly series; skip, reschedule, rest days
- **Manual log:** record a past workout after the fact, optionally completing a plan entry
- Workout templates (targets, rest, tempo, RPE/RIR, supersets/circuits), duplicate, repeat-previous, exercise library with custom exercises
- Personal records, estimated 1RM, volume, MET-based calorie-burn estimates, weekly consistency streaks
- Goals (target weight, rate, weekly workouts) with progress and projected date
- Daily recovery check-in: steps, sleep, resting HR, energy, soreness, mood
- Calorie target calculator: Mifflin-St Jeor / Katch-McArdle, TDEE (activity level or your logged workouts), lose/maintain/gain, macros, safety warnings
- Dashboard, dark/light theme, responsive mobile-first UI, offline app shell

## Local development

Needs a local PostgreSQL on `localhost:5432` (connection string in `backend/FitnessTracker.Api/appsettings.Development.json`; override per machine in a gitignored `appsettings.Development.local.json`). The API creates the `FitnessTracker` database and applies migrations on startup.

```bash
cd backend/FitnessTracker.Api && dotnet run     # http://localhost:8080 (API docs at /scalar)
cd frontend && npm install && npm run dev       # http://localhost:5173
```

## Tests

```bash
cd backend  && dotnet test                                      # unit + integration (throwaway database on the local Postgres)
cd frontend && npm test                                         # Vitest + React Testing Library
cd frontend && npx playwright install chromium && npm run e2e   # against the running dev servers
```

## Docker images

```bash
docker build -t fittrack-api backend/FitnessTracker.Api
docker build --build-arg VITE_API_BASE_URL=https://api.example.com -t fittrack-web frontend
```

The API listens on 8080 and needs `ConnectionStrings__Default` and `Cors__AllowedOrigins` (the web origin) as environment variables. The web image serves on port 80. Web and API must share a parent domain (e.g. `app.` and `api.`) for the auth cookie.

## Repository layout

```
backend/    FitnessTracker.Api (with its Dockerfile) and tests
frontend/   SPA (Dockerfile + nginx.conf) and e2e
docs/       api.md, architecture.md, frontend.md
```

## Documentation

- [API contract](docs/api.md) and [workout flow v2](docs/workout-flow.md)
- [Architecture, decisions and roadmap](docs/architecture.md)
- [Frontend](docs/frontend.md)

The calorie calculator gives population-based estimates, not medical advice.
