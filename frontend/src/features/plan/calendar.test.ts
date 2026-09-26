import { describe, expect, it } from "vitest";
import { toIsoDate } from "../../lib/format";
import type { PlanEntry, WorkoutSummary } from "../../lib/types";
import { adherence, groupByDay, monthWeeks, rangeDays, rangeParams, recurringDates, shiftAnchor } from "./calendar";

const d = (iso: string) => new Date(`${iso}T12:00:00`);
const entry = (p: Partial<PlanEntry>): PlanEntry => ({
  id: "e",
  date: "2026-09-22",
  templateId: "t1",
  templateName: "Push A",
  kind: "Workout",
  status: "Planned",
  workoutId: null,
  seriesId: null,
  note: null,
  ...p,
});
const workout = (p: Partial<WorkoutSummary>): WorkoutSummary => ({
  id: "w",
  date: "2026-09-22",
  name: "Run",
  durationMinutes: 30,
  exerciseCount: 1,
  setCount: 1,
  totalVolumeKg: 0,
  estimatedCalories: null,
  startTime: null,
  type: "Cardio",
  templateId: null,
  planEntryId: null,
  ...p,
});

describe("calendar ranges (Monday first)", () => {
  it("month grid covers whole weeks around the month", () => {
    const weeks = monthWeeks(d("2026-09-15")); // 1 Sep 2026 is a Tuesday, 30 Sep a Wednesday
    expect(weeks).toHaveLength(5);
    expect(toIsoDate(weeks[0]![0]!)).toBe("2026-08-31");
    expect(toIsoDate(weeks[4]![6]!)).toBe("2026-10-04");
    expect(weeks.every((w) => w.length === 7 && w[0]!.getDay() === 1)).toBe(true);
  });

  it("week view runs Monday–Sunday even when the anchor is a Sunday", () => {
    expect(rangeParams("week", d("2026-09-27"))).toEqual({ from: "2026-09-21", to: "2026-09-27" });
  });

  it("agenda is 14 days from the anchor", () => {
    const days = rangeDays("agenda", d("2026-09-26"));
    expect(days).toHaveLength(14);
    expect(rangeParams("agenda", d("2026-09-26"))).toEqual({ from: "2026-09-26", to: "2026-10-09" });
  });

  it("navigation steps by the view's unit", () => {
    expect(toIsoDate(shiftAnchor("month", d("2026-01-31"), 1))).toBe("2026-02-01");
    expect(toIsoDate(shiftAnchor("week", d("2026-09-26"), -1))).toBe("2026-09-19");
    expect(toIsoDate(shiftAnchor("agenda", d("2026-09-26"), 1))).toBe("2026-10-10");
  });
});

describe("recurringDates", () => {
  it("picks the chosen weekdays for N weeks from the start date", () => {
    expect(recurringDates("2026-09-28", ["Monday", "Thursday"], 2)).toEqual(["2026-09-28", "2026-10-01", "2026-10-05", "2026-10-08"]);
  });
  it("starts mid-week without going back before the start date", () => {
    // Wednesday start, one week: Wed..Tue → Friday this week, Monday next week.
    expect(recurringDates("2026-09-30", ["Monday", "Friday"], 1)).toEqual(["2026-10-02", "2026-10-05"]);
  });
  it("is empty without days or weeks", () => {
    expect(recurringDates("2026-09-30", [], 4)).toEqual([]);
    expect(recurringDates("2026-09-30", ["Monday"], 0)).toEqual([]);
  });
});

describe("groupByDay + adherence", () => {
  const entries = [
    entry({ id: "a", date: "2026-09-21", status: "Completed", workoutId: "w1" }),
    entry({ id: "b", date: "2026-09-22", status: "Skipped" }),
    entry({ id: "c", date: "2026-09-23" }), // missed (before today)
    entry({ id: "d", date: "2026-09-24", kind: "RestDay", templateName: "Rest" }),
    entry({ id: "e", date: "2026-09-27" }), // upcoming
  ];
  const workouts = [
    workout({ id: "w1", date: "2026-09-21", planEntryId: "a" }), // the completed plan: not extra
    workout({ id: "w2", date: "2026-09-25" }), // unplanned
  ];

  it("groups entries by date and keeps only unplanned workouts as extras", () => {
    const byDay = groupByDay(entries, workouts);
    expect(byDay.get("2026-09-21")).toEqual({ entries: [entries[0]], extra: [] });
    expect(byDay.get("2026-09-25")?.extra.map((w) => w.id)).toEqual(["w2"]);
    expect(byDay.has("2026-09-26")).toBe(false);
  });

  it("counts planned vs done, ignoring rest days", () => {
    expect(adherence(entries, workouts, "2026-09-26")).toEqual({ completed: 1, skipped: 1, missed: 1, upcoming: 1, extra: 1, due: 3, percent: 33 });
    expect(adherence([], [], "2026-09-26").percent).toBeNull();
  });
});
