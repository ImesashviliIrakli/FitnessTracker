import type { Exercise, LogSetInput, Session, SessionExercise, SessionInput, SessionSet } from "../../lib/types";

/** Pure session logic: progress, the "current" exercise and every edit the live screen makes. */

// randomUUID only exists on secure origins (not on http://192.168.x.x); getRandomValues always does.
const newId = (): string =>
  crypto.randomUUID?.() ??
  "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) => (+c ^ (crypto.getRandomValues(new Uint8Array(1))[0]! & (15 >> (+c / 4)))).toString(16));

/** Sets of non-skipped exercises: how many are checked off out of the total. */
export function progress(s: Session) {
  let done = 0;
  let total = 0;
  for (const ex of s.exercises) {
    if (ex.skipped) continue;
    total += ex.sets.length;
    done += ex.sets.filter((x) => x.done).length;
  }
  return { done, total };
}

export const exerciseDone = (ex: SessionExercise) => ex.sets.filter((x) => x.done).length;

/** First non-skipped exercise that still has an open set; null when everything is done. */
export function currentExercise(s: Session): SessionExercise | null {
  return s.exercises.find((ex) => !ex.skipped && ex.sets.some((x) => !x.done)) ?? null;
}

/** Checking a set with empty actuals logs what was planned. */
export function fillFromTargets(set: SessionSet): SessionSet {
  return { ...set, reps: set.reps ?? set.targetReps, weightKg: set.weightKg ?? set.targetWeightKg };
}

export function emptySet(from?: SessionSet, isWarmup = false): SessionSet {
  return {
    id: newId(),
    targetReps: from?.targetReps ?? null,
    targetWeightKg: from?.targetWeightKg ?? null,
    targetRpe: from?.targetRpe ?? null,
    reps: null,
    weightKg: null,
    rpe: null,
    rir: null,
    durationSeconds: null,
    distanceM: null,
    isWarmup,
    done: false,
  };
}

export type Action =
  | { type: "toggleSet"; exId: string; setId: string }
  | { type: "updateSet"; exId: string; setId: string; patch: Partial<Omit<SessionSet, "id">> }
  | { type: "addSet"; exId: string; warmup?: boolean }
  | { type: "removeSet"; exId: string; setId: string }
  | { type: "insertSet"; exId: string; index: number; set: SessionSet }
  | { type: "skipExercise"; exId: string; skipped: boolean }
  | { type: "swapExercise"; exId: string; exercise: Exercise }
  | { type: "addExercise"; exercise: Exercise }
  | { type: "removeExercise"; exId: string }
  | { type: "exerciseNotes"; exId: string; notes: string }
  | { type: "sessionNotes"; notes: string };

/** Set-level edits go through `POST /log`; everything else is a structural autosave (`PUT`). */
export const isSetAction = (a: Action): a is Extract<Action, { type: "toggleSet" | "updateSet" }> =>
  a.type === "toggleSet" || a.type === "updateSet";

const mapEx = (s: Session, exId: string, f: (ex: SessionExercise) => SessionExercise): Session => ({
  ...s,
  exercises: s.exercises.map((ex) => (ex.id === exId ? f(ex) : ex)),
});
const mapSet = (ex: SessionExercise, setId: string, f: (x: SessionSet) => SessionSet): SessionExercise => ({
  ...ex,
  sets: ex.sets.map((x) => (x.id === setId ? f(x) : x)),
});

export function reduce(s: Session, a: Action): Session {
  switch (a.type) {
    case "toggleSet":
      return mapEx(s, a.exId, (ex) => mapSet(ex, a.setId, (x) => (x.done ? { ...x, done: false } : { ...fillFromTargets(x), done: true })));
    case "updateSet":
      return mapEx(s, a.exId, (ex) => mapSet(ex, a.setId, (x) => ({ ...x, ...a.patch })));
    case "addSet":
      return mapEx(s, a.exId, (ex) => {
        if (a.warmup) {
          // Warm-ups go before the first working set.
          const at = ex.sets.findIndex((x) => !x.isWarmup);
          const sets = [...ex.sets];
          sets.splice(at < 0 ? sets.length : at, 0, { ...emptySet(ex.sets[at] ?? ex.sets.at(-1), true), targetWeightKg: null });
          return { ...ex, skipped: false, sets };
        }
        return { ...ex, skipped: false, sets: [...ex.sets, emptySet(ex.sets.at(-1))] };
      });
    case "removeSet":
      return mapEx(s, a.exId, (ex) => ({ ...ex, sets: ex.sets.filter((x) => x.id !== a.setId) }));
    case "insertSet":
      return mapEx(s, a.exId, (ex) => {
        const sets = [...ex.sets];
        sets.splice(Math.min(a.index, sets.length), 0, a.set);
        return { ...ex, sets };
      });
    case "skipExercise":
      return mapEx(s, a.exId, (ex) => ({ ...ex, skipped: a.skipped }));
    case "swapExercise":
      // Same sets and reps, but the old lift's target weight means nothing for the new one.
      return mapEx(s, a.exId, (ex) => ({
        ...ex,
        exerciseId: a.exercise.id,
        exerciseName: a.exercise.name,
        category: a.exercise.category,
        sets: ex.sets.map((x) => (x.done ? x : { ...x, targetWeightKg: null, weightKg: null })),
      }));
    case "addExercise":
      return {
        ...s,
        exercises: [
          ...s.exercises,
          {
            id: newId(),
            exerciseId: a.exercise.id,
            exerciseName: a.exercise.name,
            category: a.exercise.category,
            restSeconds: null,
            tempo: null,
            notes: null,
            group: null,
            groupType: null,
            skipped: false,
            sets: Array.from({ length: a.exercise.category === "Strength" ? 3 : 1 }, () => emptySet()),
          },
        ],
      };
    case "removeExercise":
      return { ...s, exercises: s.exercises.filter((ex) => ex.id !== a.exId) };
    case "exerciseNotes":
      return mapEx(s, a.exId, (ex) => ({ ...ex, notes: a.notes || null }));
    case "sessionNotes":
      return { ...s, notes: a.notes || null };
  }
}

export const toInput = (s: Session): SessionInput => ({ name: s.name, notes: s.notes, exercises: s.exercises });

export const toLog = (exId: string, x: SessionSet): LogSetInput => ({
  exerciseId: exId,
  setId: x.id,
  reps: x.reps,
  weightKg: x.weightKg,
  rpe: x.rpe,
  rir: x.rir,
  durationSeconds: x.durationSeconds,
  distanceM: x.distanceM,
  done: x.done,
});

/** Consecutive exercises sharing a group number form one superset/circuit block. */
export function blocks(exercises: SessionExercise[]) {
  const out: { group: number | null; groupType: SessionExercise["groupType"]; items: SessionExercise[] }[] = [];
  for (const ex of exercises) {
    const last = out.at(-1);
    if (ex.group !== null && last && last.group === ex.group) last.items.push(ex);
    else out.push({ group: ex.group, groupType: ex.groupType, items: [ex] });
  }
  return out;
}

/** Rest after a set, unless the next exercise in the same superset follows straight away. */
export function restAfter(s: Session, exId: string): number {
  const i = s.exercises.findIndex((ex) => ex.id === exId);
  const ex = s.exercises[i];
  if (!ex) return 0;
  const next = s.exercises[i + 1];
  if (ex.group !== null && next?.group === ex.group) return 0;
  return ex.restSeconds ?? 90;
}

/** 83 → "1:23", 3725 → "1:02:05". */
export function fmtClock(totalSeconds: number) {
  const t = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const sec = String(t % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

export const elapsedSeconds = (startedAt: string, now: number) => (now - Date.parse(startedAt)) / 1000;
