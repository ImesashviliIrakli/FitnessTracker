import type { ExerciseCategory } from "./types";

/** Epley estimated 1RM; same rule as the API (1–12 reps only). Unit-agnostic. */
export function estimate1Rm(weight: number | null, reps: number | null): number | null {
  if (weight === null || reps === null || weight <= 0 || reps < 1 || reps > 12) return null;
  return reps === 1 ? weight : weight * (1 + reps / 30);
}

export function setVolume(s: { weight: number | null; reps: number | null; isWarmup: boolean }) {
  return s.isWarmup || s.weight === null || s.reps === null ? 0 : s.weight * s.reps;
}

/** Distinct, accessible hues from the chart palette (each >= 3:1 on a card, both themes). */
export const categoryColor: Record<ExerciseCategory, string> = {
  Strength: "var(--chart-1)", // blue
  Cardio: "var(--chart-2)", // teal
  Mobility: "var(--chart-3)", // violet
  Sport: "var(--chart-4)", // rose
};

export const supersetLetter = (n: number) => String.fromCharCode(64 + n); // 1 → A
