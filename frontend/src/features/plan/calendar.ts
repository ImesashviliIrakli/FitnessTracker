import { addDays, addMonths, addWeeks, differenceInCalendarDays, endOfMonth, endOfWeek, parseISO, startOfDay, startOfMonth, startOfWeek } from "date-fns";
import { toIsoDate } from "../../lib/format";
import type { DayOfWeek, PlanEntry, WorkoutSummary } from "../../lib/types";

// Pure calendar maths for the Plan tab. ISO weeks (Monday first), same as streaks and the DatePicker.
export type CalView = "month" | "week" | "agenda";
const WEEK = { weekStartsOn: 1 } as const;
export const AGENDA_DAYS = 14;

export const weekdayOrder: DayOfWeek[] = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
export const dayOfWeek = (d: Date): DayOfWeek => weekdayOrder[(d.getDay() + 6) % 7]!;

/** Every day the view shows: month = whole weeks covering the month, week = Mon–Sun, agenda = 14 days from the anchor. */
export function rangeDays(view: CalView, anchor: Date): Date[] {
  const start = view === "month" ? startOfWeek(startOfMonth(anchor), WEEK) : view === "week" ? startOfWeek(anchor, WEEK) : startOfDay(anchor);
  const end = view === "month" ? endOfWeek(endOfMonth(anchor), WEEK) : addDays(start, view === "week" ? 6 : AGENDA_DAYS - 1);
  return Array.from({ length: differenceInCalendarDays(end, start) + 1 }, (_, i) => addDays(start, i));
}

/** `from`/`to` query params for the visible range. */
export function rangeParams(view: CalView, anchor: Date) {
  const days = rangeDays(view, anchor);
  return { from: toIsoDate(days[0]!), to: toIsoDate(days[days.length - 1]!) };
}

/** Month grid rows (4–6 weeks, Monday first). */
export function monthWeeks(anchor: Date): Date[][] {
  const days = rangeDays("month", anchor);
  return Array.from({ length: days.length / 7 }, (_, w) => days.slice(w * 7, w * 7 + 7));
}

export function shiftAnchor(view: CalView, anchor: Date, dir: 1 | -1): Date {
  if (view === "month") return addMonths(startOfMonth(anchor), dir);
  if (view === "week") return addWeeks(anchor, dir);
  return addDays(anchor, dir * AGENDA_DAYS);
}

/** Dates a recurring plan creates: the chosen weekdays within `weeks` × 7 days starting at (and including) the start date. */
export function recurringDates(startIso: string, weekdays: DayOfWeek[], weeks: number): string[] {
  if (!startIso || !(weeks > 0)) return [];
  const start = parseISO(startIso);
  const days = new Set(weekdays);
  return Array.from({ length: weeks * 7 }, (_, i) => addDays(start, i))
    .filter((d) => days.has(dayOfWeek(d)))
    .map(toIsoDate);
}

export interface DayItems {
  entries: PlanEntry[];
  /** Logged workouts not tied to a plan entry in range. */
  extra: WorkoutSummary[];
}

export function groupByDay(entries: PlanEntry[], workouts: WorkoutSummary[]): Map<string, DayItems> {
  const map = new Map<string, DayItems>();
  const at = (date: string) => {
    let d = map.get(date);
    if (!d) map.set(date, (d = { entries: [], extra: [] }));
    return d;
  };
  const workoutIds = new Set(entries.map((e) => e.workoutId));
  const entryIds = new Set(entries.map((e) => e.id));
  for (const e of entries) at(e.date).entries.push(e);
  for (const w of workouts) if (!workoutIds.has(w.id) && !(w.planEntryId && entryIds.has(w.planEntryId))) at(w.date).extra.push(w);
  return map;
}

export const isMissed = (e: PlanEntry, todayIso: string) => e.status === "Planned" && e.kind !== "RestDay" && e.date < todayIso;

/** Planned vs done for the visible range. Rest days don't count. `percent` = completed / due (completed + skipped + missed). */
export function adherence(entries: PlanEntry[], workouts: WorkoutSummary[], todayIso: string) {
  const training = entries.filter((e) => e.kind !== "RestDay");
  const completed = training.filter((e) => e.status === "Completed").length;
  const skipped = training.filter((e) => e.status === "Skipped").length;
  const missed = training.filter((e) => isMissed(e, todayIso)).length;
  const upcoming = training.filter((e) => e.status === "Planned" && e.date >= todayIso).length;
  const extra = [...groupByDay(entries, workouts).values()].reduce((n, d) => n + d.extra.length, 0);
  const due = completed + skipped + missed;
  return { completed, skipped, missed, upcoming, extra, due, percent: due ? Math.round((completed / due) * 100) : null };
}
