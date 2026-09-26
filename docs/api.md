# API contract

Base URL: `https://api.<domain>` (local: `http://localhost:8080`). Interactive docs: `/scalar` (Development only), OpenAPI JSON at `/openapi/v1.json`.

**Workout flow v2** (templates, plan/schedule, live sessions, manual-log extensions, logged-activity calories) is specified in [workout-flow.md](workout-flow.md); it extends the workouts, profile, calculator and dashboard shapes below.

## Conventions

- JSON, camelCase. Enums are **strings**.
- **All body values are metric**: kg, cm, meters, seconds. The frontend converts for imperial display.
- Dates are `YYYY-MM-DD` (`DateOnly`); timestamps are ISO-8601 UTC.
- Auth: ASP.NET Core Identity cookie (`HttpOnly`, `Secure`, `SameSite=Lax`). Browser calls must use `credentials: "include"`.
- **CSRF:** every `POST/PUT/PATCH/DELETE` must send header `X-CSRF: 1` (forces a CORS preflight; missing header → `400`).
- Errors are RFC 9457 ProblemDetails. Validation errors → `400` with `errors: { field: [messages] }` (keys camelCase; messages plain English, e.g. "Target weight must be between 20 and 400."). A form-level error (key `""`) is also returned as `detail`. Unauthenticated → `401`. Not found / not yours → `404`. Conflict → `409`. Rate limited → `429`.

## Enums

| Enum | Values |
|---|---|
| `Sex` | `Male`, `Female` |
| `ActivityLevel` | `Sedentary`, `Light`, `Moderate`, `VeryActive`, `ExtraActive` |
| `UnitSystem` | `Metric`, `Imperial` |
| `GoalMode` | `Lose`, `Maintain`, `Gain` |
| `ExerciseCategory` | `Strength`, `Cardio`, `Mobility`, `Sport` |

## Auth — `/api/auth`

| Method | Path | Body | Response |
|---|---|---|---|
| POST | `/register` | `{ email, password, displayName }` | `200 Me` (signed in) |
| POST | `/login` | `{ email, password, rememberMe }` | `200 Me` / `401` |
| POST | `/logout` | – | `204` |
| GET | `/me` | – | `200 Me` / `401` |

`Me = { id, email, displayName, profileComplete: bool, unitSystem }`

Password policy: ≥ 10 chars with a digit, an uppercase and a lowercase letter. Auth endpoints are rate limited (10/min/IP).

## Profile — `/api/profile`

`GET` → `Profile`; `PUT` body `UpdateProfile` → `Profile`

```
Profile = {
  displayName, email,
  dateOfBirth: "1990-04-02" | null, age: int | null,
  sex: Sex | null, heightCm: number | null,
  activityLevel: ActivityLevel, unitSystem: UnitSystem, timeZone: "Europe/Berlin"   // IANA id
}
UpdateProfile = { displayName, dateOfBirth, sex, heightCm (100–250), activityLevel, unitSystem, timeZone }
```

## Goals — `/api/goals`

`GET` → `Goal`; `PUT` body `Goal` → `Goal`

```
Goal = { mode: GoalMode, targetWeightKg: number | null, targetDate: date | null,
         weeklyRateKg: number (0–1.5, magnitude), weeklyWorkoutTarget: int (0–7) }
```

`PUT` rules (checked against the latest logged weight and the user's time zone): `Lose` needs `targetWeightKg` below the current weight and `Gain` above it (`400` on `targetWeightKg`, e.g. "For a loss goal, the target must be below your current weight (120 kg)."); `targetDate`, if set, must be after today (`400` on `targetDate`).

## Weight entries — `/api/weights`

| Method | Path | Notes |
|---|---|---|
| GET | `?from=&to=` | ascending by date; default last 365 days |
| POST | body `WeightInput` | `201`; `409` if an entry exists for that date |
| PUT | `/{id}` body `WeightInput` | |
| DELETE | `/{id}` | `204` |
| GET | `/export.csv` | CSV download of all entries |

```
WeightInput = { date, weightKg (20–400), bodyFatPercent (2–70) | null, note | null (≤500) }
WeightEntry = { id, date, weightKg, bodyFatPercent, leanMassKg | null, bmi | null, note }
```

## Measurements — `/api/measurements`

GET (`?from=&to=`), POST, PUT `/{id}`, DELETE `/{id}` — same semantics as weights (one per date).

```
MeasurementInput = { date, waistCm, chestCm, hipsCm, armCm, thighCm, neckCm, shouldersCm (all number|null, 10–300), note }
Measurement = { id, ...MeasurementInput }
```

## Daily check-in — `/api/daily`

Recovery & activity only (no food/drink, ever).

| Method | Path | Notes |
|---|---|---|
| GET | `?from=&to=` | ascending; default last 30 days |
| PUT | `/{date}` body `DailyInput` | upsert → `DailyLog` |
| DELETE | `/{date}` | `204` |

```
DailyInput = { steps: int|null (0–100000), sleepHours: number|null (0–24), restingHeartRate: int|null (25–220),
               energy: 1–5|null, soreness: 1–5|null, mood: 1–5|null, note|null }
DailyLog   = { date, ...DailyInput }
```
A check-in with every field empty (note blank) → `400`, `detail: "Fill in at least one value."`.

## Exercises — `/api/exercises`

| Method | Path | Notes |
|---|---|---|
| GET | – | built-in library + user's custom, sorted by name |
| POST | body `{ name, category, primaryMuscle|null, met|null }` | `201` custom exercise |
| DELETE | `/{id}` | custom only; `409` if used in a workout or template |

`Exercise = { id, name, category, primaryMuscle, met, isCustom }`

## Workouts — `/api/workouts`

A workout is saved as a whole (nested exercises and sets are replaced on PUT). Order of arrays = display order.

| Method | Path | Response |
|---|---|---|
| GET | `?from=&to=` | `WorkoutSummary[]` (descending by date; default last 12 months) |
| GET | `/{id}` | `Workout` |
| POST | body `WorkoutInput` | `201 Workout` |
| PUT | `/{id}` body `WorkoutInput` | `Workout` |
| DELETE | `/{id}` | `204` |

```
WorkoutInput = {
  date, name (1–100), durationMinutes: int|null (1–1440), notes|null,
  exercises: [{ exerciseId, supersetGroup: int|null, notes|null,
                sets: [{ reps|null, weightKg|null, rpe|null (1–10), rir|null (0–10), restSeconds|null,
                         tempo|null (e.g. "3-1-1-0"), durationSeconds|null, distanceM|null,
                         avgHeartRate|null, isWarmup: bool }] }]
}
Workout = { id, date, name, durationMinutes, notes, totalVolumeKg, estimatedCalories|null,
            exercises: [{ exerciseId, exerciseName, category, supersetGroup, notes,
                          sets: [{ ...set, estimated1Rm|null, paceSecPerKm|null }] }] }
WorkoutSummary = { id, date, name, durationMinutes, exerciseCount, setCount, totalVolumeKg, estimatedCalories|null }
```

- Volume = Σ reps × weightKg over non-warmup sets.
- e1RM (Epley) = w × (1 + reps/30), only for 1–12 reps (1 rep → w).
- Calories (MET) = MET × latest bodyweightKg × hours. Per cardio set when it has `durationSeconds`; otherwise for the whole workout using `durationMinutes` × average MET of its exercises. `null` if no weight entry.

## Templates — `/api/templates`

See [workout-flow.md](workout-flow.md#templates--apitemplates-extended) (v2 shape: `description`, `kind`, per-item targets, duplicate).

## Personal records — `GET /api/records`

`PersonalRecord[] = { exerciseId, exerciseName, bestWeightKg, bestWeightDate, bestWeightReps, best1Rm, best1RmDate }` (`bestWeightReps` = most reps at `bestWeightKg` on `bestWeightDate`, the first day that weight was lifted) (strength sets only, warmups excluded), sorted by name.

## Dashboard — `GET /api/dashboard`

```
{
  weight: { latestKg|null, latestDate|null, change30dKg|null, avg7dKg|null, bmi|null, bodyFatPercent|null,
            series: [{ date, weightKg, trendKg }] },           // last 90 days; trendKg = exponentially smoothed trend
  goal: { mode, targetWeightKg|null, startWeightKg|null, progressPercent|null (0–100), projectedDate|null,
          targetDate|null, targetDateFeasible: bool|null, requiredWeeklyRateKg|null },
                                  // progressPercent/projectedDate are null when the target is on the wrong side of the latest weight;
                                  // targetDateFeasible = projectedDate <= targetDate (null without both); requiredWeeklyRateKg = kg/week
                                  // to hit the target by targetDate, rounded to 0.05 (null without a future date or for Maintain)
  training: { workoutsThisWeek, weeklyTarget, weekStreak, totalWorkouts,
              weeks: [{ weekStart, workouts, volumeKg }] },     // last 12 ISO weeks (Mon start), oldest first
  recentRecords: [{ exerciseId, exerciseName, weightKg, reps, estimated1Rm, date }] (≤5, newest first),
  calories: CalorieResult | null                               // null until profile has dob, sex, height and a weight
}
```

## Calorie calculator — `POST /api/calculator`

Stateless estimate. **Does not log food or drink.**

```
CalorieInput = { sex, age (14–100), heightCm (100–250), weightKg (20–400), bodyFatPercent|null (2–70),
                 activityLevel, mode, weeklyRateKg (0–1.5), targetWeightKg|null }
CalorieResult = {
  formula: "MifflinStJeor" | "KatchMcArdle", bmr, tdee, targetCalories, dailyAdjustment,
  weeklyRateKg, projectedWeeks|null, projectedDate|null,
  macros: { proteinG, fatG, carbsG },
  warnings: string[]
}
```
Macros use a reference mass: lean mass when `bodyFatPercent` is known, else `targetWeightKg` when losing (if set), else `weightKg`. Protein 2.2 g/kg lean mass (lose) / 2.0 (else), or 1.8 / 1.6 g/kg of the reference mass without body fat. Fat 25% of kcal, at least 0.5 g/kg reference mass. Carbs are the remainder; if protein + fat exceed the target both scale down, so `4·protein + 9·fat + 4·carbs ≈ targetCalories` (±10).

## Account — `/api/account`

| Method | Path | Notes |
|---|---|---|
| GET | `/export` | full JSON export (attachment) |
| POST | `/delete` body `{ password }` | deletes user + all data, signs out, `204`; `400` on wrong password |

## Health

`GET /health` → `200` when app + database are healthy. `GET /health/live` → liveness only (no DB).
