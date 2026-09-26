import type { UnitSystem } from "./types";

// The API is metric-only. Everything the user sees or types goes through here.
export const KG_PER_LB = 0.45359237;
export const CM_PER_IN = 2.54;
export const M_PER_MI = 1609.344;

const round = (v: number, digits: number) => {
  const f = 10 ** digits;
  return Math.round(v * f) / f;
};

export function units(system: UnitSystem) {
  const imperial = system === "Imperial";
  return {
    system,
    weight: imperial ? "lb" : "kg",
    length: imperial ? "in" : "cm",
    distance: imperial ? "mi" : "km",
    pace: imperial ? "/mi" : "/km",

    /** kg → display (1 dp) */
    toWeight: (kg: number) => round(imperial ? kg / KG_PER_LB : kg, 1),
    /** display → kg (3 dp so round-trips stay stable) */
    fromWeight: (v: number) => round(imperial ? v * KG_PER_LB : v, 3),

    toLength: (cm: number) => round(imperial ? cm / CM_PER_IN : cm, 1),
    fromLength: (v: number) => round(imperial ? v * CM_PER_IN : v, 2),

    /** meters → km or mi (2 dp) */
    toDistance: (m: number) => round(m / (imperial ? M_PER_MI : 1000), 2),
    fromDistance: (v: number) => round(v * (imperial ? M_PER_MI : 1000), 1),

    /** seconds per km → "m:ss" per km or per mile */
    formatPace: (secPerKm: number) => {
      const s = Math.round(imperial ? secPerKm * (M_PER_MI / 1000) : secPerKm);
      return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
    },

    formatHeight: (cm: number) => {
      if (!imperial) return `${Math.round(cm)} cm`;
      const totalIn = Math.round(cm / CM_PER_IN);
      return `${Math.floor(totalIn / 12)} ft ${totalIn % 12} in`;
    },
  };
}

export type Units = ReturnType<typeof units>;
