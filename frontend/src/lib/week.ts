import type { PlanEntry, WorkoutSummary } from "./types";

export type Pace = "none" | "hit" | "onTrack" | "behind";

/**
 * Weekly workouts vs target, judged against the pace so far: on track when done >= target × daysElapsed / 7.
 * `daysElapsed` counts finished days this ISO week (Monday = 0 … Sunday = 6), so Monday morning is never "behind".
 */
export function weeklyPace(done: number, target: number, daysElapsed: number): Pace {
  if (target <= 0) return "none";
  if (done >= target) return "hit";
  return done >= (target * daysElapsed) / 7 ? "onTrack" : "behind";
}

/** Finished days so far in the ISO week containing `now`. */
export const daysElapsedThisWeek = (now: Date) => (now.getDay() + 6) % 7;

export type DayKind = "done" | "rest" | "planned" | "missed" | "skipped" | "empty";

/** What one day of "This week" shows: logged work first, then the plan, then a label for an empty day. */
export function weekDay(iso: string, todayIso: string, workouts: WorkoutSummary[], entries: PlanEntry[]): { kind: DayKind; label: string } {
  const logged = workouts.filter((w) => w.date === iso);
  if (logged.length) return { kind: "done", label: logged[0]!.name };
  const planned = entries.filter((e) => e.date === iso);
  const rest = planned.find((e) => e.kind === "RestDay");
  const training = planned.find((e) => e.kind !== "RestDay");
  if (training) {
    const name = training.templateName ?? "Planned workout";
    if (training.status === "Skipped") return { kind: "skipped", label: name };
    if (training.status === "Planned" && iso < todayIso) return { kind: "missed", label: name };
    return { kind: "planned", label: name };
  }
  if (rest) return { kind: "rest", label: "Rest day" };
  if (iso < todayIso) return { kind: "empty", label: "No workout" };
  if (iso === todayIso) return { kind: "empty", label: "Nothing logged" };
  return { kind: "empty", label: "Nothing planned" };
}
