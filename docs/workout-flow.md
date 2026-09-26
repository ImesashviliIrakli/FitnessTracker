# Workout flow v2: contract

Extends [api.md](api.md). Same conventions: JSON camelCase, string enums, metric units, `YYYY-MM-DD` dates, ISO-8601 UTC timestamps, `X-CSRF: 1` on writes, ProblemDetails errors.

## Data model

Four separate concepts, one history:

| Concept | Entity | Notes |
|---|---|---|
| Exercise library | `Exercise` (existing) | built-in + custom |
| Templates | `WorkoutTemplate` (extended) | reusable plan of exercises; `Kind = RestDay` has no exercises |
| Scheduled plans | `PlanEntry` (new) | a template on a date; `Planned` / `Completed` / `Skipped`; recurring entries share a `SeriesId` |
| Live session | `WorkoutSession` (new) | one in-progress draft per user, stored as a jsonb document (survives reloads / device switches) |
| Logged sessions | `Workout` (existing, extended) | the single history every stat reads from; written by **finish session** and by **manual log** |

A finished session and a manual log both produce a `Workout`; dashboard, PRs, streaks, weekly goals and calorie math read only `Workout`s, so all flows stay consistent. Deleting a template never deletes history (`Workout.TemplateId` / `PlanEntry.TemplateId` are set to null).

## Enums

| Enum | Values |
|---|---|
| `WorkoutType` | `Strength`, `Cardio`, `Mobility`, `Other` |
| `TemplateKind` | `Workout`, `RestDay` |
| `GroupType` | `Superset`, `Circuit` |
| `PlanStatus` | `Planned`, `Completed`, `Skipped` |

## Templates — `/api/templates` (extended)

```
TemplateItemInput = {
  exerciseId, sets: int (1–20), reps: int|null (1–1000),
  targetWeightKg: number|null (0–1000), targetPercent1Rm: number|null (30–110),
  restSeconds: int|null (0–3600), tempo: string|null ("3-1-1-0"), rpe: number|null (1–10), rir: int|null (0–10),
  notes: string|null (≤500), group: int|null (1–20), groupType: GroupType|null   // same group number = superset/circuit block
}
TemplateInput = { name (1–100), description: string|null (≤500), kind: TemplateKind, exercises: TemplateItemInput[] }
   // Workout: 1–50 exercises. RestDay: exercises must be empty.
Template = { id, name, description, kind, exercises: (TemplateItemInput & { exerciseName, category })[] }
```

| Method | Path | Notes |
|---|---|---|
| GET | `/api/templates` | sorted by name |
| POST | `/api/templates` | `201 Template` |
| PUT | `/api/templates/{id}` | `Template` |
| POST | `/api/templates/{id}/duplicate` | `201 Template`, name `"<name> (copy)"` |
| DELETE | `/api/templates/{id}` | `204`; planned (not completed) entries using it are deleted, history untouched |

Stored items are jsonb; the old `weightKg` field maps to `targetWeightKg` (existing data keeps working).

## Plan — `/api/plan`

```
PlanEntry = { id, date, templateId|null, templateName|null, kind: TemplateKind|null, status: PlanStatus,
              workoutId|null, seriesId|null, note|null }
```

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/api/plan?from=&to=` | – | `PlanEntry[]` ascending by date; `from`/`to` required, span ≤ 400 days |
| GET | `/api/plan/{id}` | – | `PlanEntry`; `404` if not yours |
| GET | `/api/plan/next` | – | `{ entry: PlanEntry|null }`: today's first `Planned` workout entry, else the next upcoming one within 14 days (rest days skipped) |
| POST | `/api/plan` | `{ templateId, date, note|null }` | `201 PlanEntry` |
| POST | `/api/plan/recurring` | `{ templateId, startDate, weekdays: DayOfWeek[] (1–7 distinct, e.g. "Monday"), weeks: 1–26, note|null }` | `201 PlanEntry[]` (shared `seriesId`) |
| PUT | `/api/plan/{id}` | `{ date, templateId, note|null, status: "Planned"|"Skipped" }` | `PlanEntry`; `409` if the entry is `Completed` |
| DELETE | `/api/plan/{id}` | – | `204`; `409` if `Completed` (history is kept) |
| DELETE | `/api/plan/series/{seriesId}?from=` | – | `{ deleted: int }`: removes the series' `Planned`/`Skipped` entries on/after `from` (default today) |

## Live session — `/api/sessions`

```
SessionSet = {
  id: string (client-stable id), targetReps|null, targetWeightKg|null, targetRpe|null,
  reps|null, weightKg|null, rpe|null, rir|null, durationSeconds|null, distanceM|null,
  isWarmup: bool, done: bool
}
SessionExercise = {
  id: string, exerciseId, exerciseName, category: ExerciseCategory,
  restSeconds|null, tempo|null, notes|null, group|null, groupType: GroupType|null,
  skipped: bool, sets: SessionSet[]
}
Session = { id, name, startedAt, templateId|null, planEntryId|null, notes|null, exercises: SessionExercise[], updatedAt }
SessionInput = { name (1–100), notes|null, exercises: SessionExercise[] }   // exerciseName/category ignored on input (server fills them)
```

| Method | Path | Body | Response |
|---|---|---|---|
| POST | `/api/sessions` | `{ planEntryId|null, templateId|null, name|null }` | `201 Session`; `409` with the existing `Session` if one is already active |
| GET | `/api/sessions/active` | – | `200 Session` or `204` |
| PUT | `/api/sessions/{id}` | `SessionInput` | `Session` (autosave: replaces the draft; swap exercise / add/skip sets / add exercises happen here) |
| POST | `/api/sessions/{id}/log` | `{ exerciseId (SessionExercise.id), setId, reps|null, weightKg|null, rpe|null, rir|null, durationSeconds|null, distanceM|null, done: bool }` | `Session` (log / check off one set) |
| POST | `/api/sessions/{id}/finish` | `{ notes|null, durationMinutes|null }` | `201 SessionSummary` |
| DELETE | `/api/sessions/{id}` | – | `204` (discard) |

Start rules:
- `planEntryId` → uses that entry's template (must be `Planned` and a workout day); `templateId` → that template; neither → empty ad-hoc session named `name ?? "Workout"`.
- Each template item becomes an exercise with `sets` rows. Target weight = `targetWeightKg`, else `targetPercent1Rm × best e1RM` rounded to 2.5 kg, else the weight of the last logged set of that exercise, else null. `targetReps = reps`, `targetRpe = rpe`, `restSeconds`/`tempo`/`notes`/`group` copied.
- Ids for exercises/sets are server-generated GUID strings; clients may add items with their own unique ids.

Finish rules:
- Only `done` sets of non-`skipped` exercises are logged (actual reps/weight; if a done set has null actuals, its targets are used). Exercises without done sets are dropped. No done sets → `400` ("Log at least one set before finishing.").
- Creates a `Workout`: date = session start date in the user's time zone, `startTime` = local start time, `durationMinutes` = body value or elapsed minutes (min 1), `type` derived from the exercises, `templateId`, `planEntryId`, notes.
- Marks the plan entry `Completed` with `workoutId`. Deletes the session.

```
SessionSummary = {
  workout: Workout, durationMinutes, setsDone, totalVolumeKg, estimatedCalories|null,
  prs: [{ exerciseId, exerciseName, kind: "Weight"|"E1rm", value, previous|null }],   // beaten vs history before this workout
  weekStreak, workoutsThisWeek, weeklyTarget,
  nextPlan: PlanEntry|null
}
```

## Logged workouts — `/api/workouts` (extended, also the manual-log endpoint)

`WorkoutInput` adds `startTime: "HH:mm"|null`, `type: WorkoutType|null` (derived from exercises when null), `templateId|null`, `planEntryId|null` (marks that entry `Completed`).
`Workout` and `WorkoutSummary` add `startTime`, `type`, `templateId`, `planEntryId`.

## Calories burned → TDEE

- `Profile` / `UpdateProfile` add `useLoggedActivity: bool` (default false).
- `CalorieInput` adds `exerciseKcalPerDay: number|null` (0–3000). When set: `tdee = bmr × 1.2 + exerciseKcalPerDay` (sedentary base + your measured training, so activity isn't double-counted); otherwise the activity multiplier.
- `CalorieResult` adds `activitySource: "ActivityLevel"|"LoggedWorkouts"` and `exerciseKcalPerDay|null`.
- Dashboard: `training` adds `avgExerciseKcalPerDay` (estimated calories of the last 28 days ÷ 28), `plannedThisWeek`, `completedPlannedThisWeek`; top-level `nextPlan: PlanEntry|null`. `calories` uses `avgExerciseKcalPerDay` when `useLoggedActivity` is on.
- Records (`/api/records` and dashboard `recentRecords`) include the reps of the heaviest set: `PersonalRecord.bestWeightReps`, `recentRecords[].reps`. Macros and goal fields: see [api.md](api.md#calorie-calculator--post-apicalculator).
