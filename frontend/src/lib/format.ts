import { format, parseISO } from "date-fns";

/** Local calendar date as the API's `YYYY-MM-DD`. */
export const toIsoDate = (d: Date) => format(d, "yyyy-MM-dd");
export const today = () => toIsoDate(new Date());

const dateFmt = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric" });
const shortDateFmt = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short" });
const weekdayFmt = new Intl.DateTimeFormat(undefined, { weekday: "short", day: "numeric", month: "short" });

export const fmtDate = (iso: string) => dateFmt.format(parseISO(iso));
export const fmtShortDate = (iso: string) => shortDateFmt.format(parseISO(iso));
export const fmtWeekday = (iso: string) => weekdayFmt.format(parseISO(iso));

const numFmts = new Map<number, Intl.NumberFormat>();
export function fmtNum(v: number, digits = 0) {
  let f = numFmts.get(digits);
  if (!f) numFmts.set(digits, (f = new Intl.NumberFormat(undefined, { maximumFractionDigits: digits })));
  return f.format(v);
}

/** Signed change, e.g. "+1.2" / "−0.8" (true minus sign). */
export function fmtDelta(v: number, digits = 1) {
  const s = fmtNum(Math.abs(v), digits);
  return v > 0 ? `+${s}` : v < 0 ? `−${s}` : s;
}

/** Empty input → null; otherwise a finite number or null. For optional numeric fields. */
export function numOrNull(v: unknown): number | null {
  if (v === "" || v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}
