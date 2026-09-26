import { describe, expect, it } from "vitest";
import type { Exercise, Session, SessionExercise, SessionSet } from "../../lib/types";
import { blocks, currentExercise, emptySet, fillFromTargets, fmtClock, progress, reduce, restAfter } from "./session";

const set = (over: Partial<SessionSet> = {}): SessionSet => ({ ...emptySet(), targetReps: 8, targetWeightKg: 60, ...over });
const ex = (id: string, sets: SessionSet[], over: Partial<SessionExercise> = {}): SessionExercise => ({
  id,
  exerciseId: `lib-${id}`,
  exerciseName: id,
  category: "Strength",
  restSeconds: 120,
  tempo: null,
  notes: null,
  group: null,
  groupType: null,
  skipped: false,
  sets,
  ...over,
});
const session = (exercises: SessionExercise[]): Session => ({
  id: "s",
  name: "Push",
  startedAt: "2026-09-26T10:00:00Z",
  templateId: null,
  planEntryId: null,
  notes: null,
  exercises,
  updatedAt: "2026-09-26T10:00:00Z",
});
const row: Exercise = { id: "row", name: "Row", category: "Strength", primaryMuscle: null, met: null, isCustom: false };

describe("session helpers", () => {
  it("counts progress over non-skipped exercises", () => {
    const s = session([ex("a", [set({ done: true }), set()]), ex("b", [set({ done: true })], { skipped: true }), ex("c", [set()])]);
    expect(progress(s)).toEqual({ done: 1, total: 3 });
  });

  it("current exercise is the first non-skipped one with an open set", () => {
    const s = session([ex("a", [set({ done: true })]), ex("b", [set()], { skipped: true }), ex("c", [set()])]);
    expect(currentExercise(s)?.id).toBe("c");
    expect(currentExercise(session([ex("a", [set({ done: true })])]))).toBeNull();
  });

  it("fills empty actuals from targets but keeps typed ones", () => {
    expect(fillFromTargets(set())).toMatchObject({ reps: 8, weightKg: 60 });
    expect(fillFromTargets(set({ reps: 6 }))).toMatchObject({ reps: 6, weightKg: 60 });
  });

  it("toggleSet checks with targets filled, and unchecks keeping values", () => {
    const x = set();
    let s = reduce(session([ex("a", [x])]), { type: "toggleSet", exId: "a", setId: x.id });
    expect(s.exercises[0]!.sets[0]).toMatchObject({ done: true, reps: 8, weightKg: 60 });
    s = reduce(s, { type: "toggleSet", exId: "a", setId: x.id });
    expect(s.exercises[0]!.sets[0]).toMatchObject({ done: false, reps: 8 });
  });

  it("adds a set copying the last targets, and a warm-up before working sets", () => {
    let s = reduce(session([ex("a", [set({ done: true, reps: 8 })])]), { type: "addSet", exId: "a" });
    const added = s.exercises[0]!.sets[1]!;
    expect(added).toMatchObject({ targetReps: 8, targetWeightKg: 60, reps: null, done: false, isWarmup: false });
    s = reduce(s, { type: "addSet", exId: "a", warmup: true });
    expect(s.exercises[0]!.sets[0]).toMatchObject({ isWarmup: true, targetWeightKg: null });
    expect(new Set(s.exercises[0]!.sets.map((x) => x.id)).size).toBe(3);
  });

  it("removes and re-inserts a set at its index (undo)", () => {
    const [a, b, c] = [set(), set(), set()];
    let s = reduce(session([ex("e", [a, b, c])]), { type: "removeSet", exId: "e", setId: b.id });
    expect(s.exercises[0]!.sets.map((x) => x.id)).toEqual([a.id, c.id]);
    s = reduce(s, { type: "insertSet", exId: "e", index: 1, set: b });
    expect(s.exercises[0]!.sets.map((x) => x.id)).toEqual([a.id, b.id, c.id]);
  });

  it("skips and unskips an exercise", () => {
    let s = reduce(session([ex("a", [set()])]), { type: "skipExercise", exId: "a", skipped: true });
    expect(s.exercises[0]!.skipped).toBe(true);
    expect(progress(s).total).toBe(0);
    s = reduce(s, { type: "skipExercise", exId: "a", skipped: false });
    expect(s.exercises[0]!.skipped).toBe(false);
  });

  it("swaps the exercise, keeps done sets, clears open target weights", () => {
    const s = reduce(session([ex("a", [set({ done: true, weightKg: 60, reps: 8 }), set()])]), { type: "swapExercise", exId: "a", exercise: row });
    const e = s.exercises[0]!;
    expect(e).toMatchObject({ exerciseId: "row", exerciseName: "Row" });
    expect(e.sets[0]).toMatchObject({ done: true, weightKg: 60 });
    expect(e.sets[1]).toMatchObject({ targetWeightKg: null, targetReps: 8 });
  });

  it("adds an exercise on the fly with fresh ids", () => {
    const s = reduce(session([]), { type: "addExercise", exercise: row });
    expect(s.exercises).toHaveLength(1);
    expect(s.exercises[0]).toMatchObject({ exerciseId: "row", skipped: false });
    expect(s.exercises[0]!.sets).toHaveLength(3);
    expect(s.exercises[0]!.id).not.toBe("row");
  });

  it("groups supersets and skips rest between their exercises", () => {
    const s = session([ex("a", [set()], { group: 1, groupType: "Superset" }), ex("b", [set()], { group: 1, restSeconds: 90 }), ex("c", [set()], { restSeconds: null })]);
    expect(blocks(s.exercises).map((b) => b.items.map((i) => i.id))).toEqual([["a", "b"], ["c"]]);
    expect(restAfter(s, "a")).toBe(0);
    expect(restAfter(s, "b")).toBe(90);
    expect(restAfter(s, "c")).toBe(90); // default when the plan has none
  });

  it("formats clocks", () => {
    expect(fmtClock(83)).toBe("1:23");
    expect(fmtClock(3725)).toBe("1:02:05");
    expect(fmtClock(-5)).toBe("0:00");
  });
});
