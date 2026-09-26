import { describe, expect, it } from "vitest";
import type { PlanEntry, WorkoutSummary } from "./types";
import { daysElapsedThisWeek, weekDay, weeklyPace } from "./week";

describe("weeklyPace", () => {
  it("is behind at 1 of 7 on a Saturday (5 days elapsed)", () => {
    expect(weeklyPace(1, 7, 5)).toBe("behind");
    expect(weeklyPace(1, 3, 5)).toBe("behind"); // needs 2.14
    expect(weeklyPace(3, 7, 5)).toBe("behind"); // needs 5
  });
  it("is on track when done keeps up with target × elapsed / 7", () => {
    expect(weeklyPace(0, 3, 0)).toBe("onTrack"); // Monday morning
    expect(weeklyPace(1, 3, 2)).toBe("onTrack"); // needs 0.86
    expect(weeklyPace(5, 7, 5)).toBe("onTrack");
  });
  it("hits the target and ignores a missing target", () => {
    expect(weeklyPace(3, 3, 1)).toBe("hit");
    expect(weeklyPace(4, 0, 6)).toBe("none");
  });
  it("counts finished days in the ISO week", () => {
    expect(daysElapsedThisWeek(new Date(2026, 8, 21))).toBe(0); // Monday
    expect(daysElapsedThisWeek(new Date(2026, 8, 26))).toBe(5); // Saturday
    expect(daysElapsedThisWeek(new Date(2026, 8, 27))).toBe(6); // Sunday
  });
});

describe("weekDay labels", () => {
  const today = "2026-09-24";
  const entry = (p: Partial<PlanEntry>): PlanEntry => ({ id: "e", date: today, templateId: "t", templateName: "Push A", kind: "Workout", status: "Planned", workoutId: null, seriesId: null, note: null, ...p });
  const w = { id: "w", date: "2026-09-21", name: "Leg day" } as WorkoutSummary;

  it("labels empty days by past / today / future, never 'Rest' or 'Upcoming'", () => {
    expect(weekDay("2026-09-22", today, [], [])).toEqual({ kind: "empty", label: "No workout" });
    expect(weekDay(today, today, [], [])).toEqual({ kind: "empty", label: "Nothing logged" });
    expect(weekDay("2026-09-27", today, [], [])).toEqual({ kind: "empty", label: "Nothing planned" });
  });
  it("shows a rest day only when one was planned", () => {
    expect(weekDay("2026-09-22", today, [], [entry({ date: "2026-09-22", kind: "RestDay", templateName: "Rest" })])).toEqual({ kind: "rest", label: "Rest day" });
  });
  it("shows the planned template name, and flags missed/skipped", () => {
    expect(weekDay("2026-09-26", today, [], [entry({ date: "2026-09-26" })])).toEqual({ kind: "planned", label: "Push A" });
    expect(weekDay("2026-09-23", today, [], [entry({ date: "2026-09-23" })]).kind).toBe("missed");
    expect(weekDay("2026-09-23", today, [], [entry({ date: "2026-09-23", status: "Skipped" })]).kind).toBe("skipped");
  });
  it("prefers what was logged", () => {
    expect(weekDay("2026-09-21", today, [w], [entry({ date: "2026-09-21" })])).toEqual({ kind: "done", label: "Leg day" });
  });
});
