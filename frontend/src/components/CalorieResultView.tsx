import { AlertTriangle } from "lucide-react";
import { fmtDate, fmtNum } from "../lib/format";
import type { CalorieResult } from "../lib/types";
import type { Units } from "../lib/units";

const macroColors = { proteinG: "var(--chart-1)", fatG: "var(--chart-2)", carbsG: "var(--chart-4)" } as const;
const macroLabels = { proteinG: "Protein", fatG: "Fat", carbsG: "Carbs" } as const;
const kcalPerG = { proteinG: 4, fatG: 9, carbsG: 4 } as const;

export function CalorieResultView({ result, u, compact }: { result: CalorieResult; u: Units; compact?: boolean }) {
  const macros = (Object.keys(macroLabels) as (keyof typeof macroLabels)[]).map((k) => ({
    key: k,
    grams: result.macros[k],
    kcal: result.macros[k] * kcalPerG[k],
  }));
  const macroKcal = macros.reduce((s, m) => s + m.kcal, 0) || 1;
  const adj = result.dailyAdjustment;
  const logged = result.activitySource === "LoggedWorkouts";

  return (
    <div className="space-y-5">
      <div>
        <p className="text-[0.8125rem] text-muted">Daily calorie target</p>
        <p className="stat mt-1 text-[2rem] leading-none text-accent-fg sm:text-[2.25rem]">
          {fmtNum(result.targetCalories)} <span className="text-base text-muted">kcal</span>
        </p>
        <p className="mt-2 text-[0.8125rem] leading-relaxed text-muted">
          {adj === 0
            ? "Matches your estimated maintenance."
            : `${fmtNum(Math.abs(adj))} kcal ${adj < 0 ? "below" : "above"} maintenance, for about ${fmtNum(u.toWeight(result.weeklyRateKg), 2)} ${u.weight} a week.`}
        </p>
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-[0.8125rem] sm:grid-cols-3">
        <div>
          <dt className="text-xs leading-snug text-muted">Resting (BMR)</dt>
          <dd className="num whitespace-nowrap">{fmtNum(result.bmr)} kcal</dd>
        </div>
        <div>
          <dt className="text-xs leading-snug text-muted">Maintenance (TDEE)</dt>
          <dd className="num whitespace-nowrap">{fmtNum(result.tdee)} kcal</dd>
        </div>
        {!compact && (
          <div>
            <dt className="text-xs leading-snug text-muted">Formula</dt>
            <dd className="font-semibold">{result.formula === "KatchMcArdle" ? "Katch-McArdle" : "Mifflin-St Jeor"}</dd>
          </div>
        )}
        <div className="col-span-2 sm:col-span-3">
          <dt className="text-xs leading-snug text-muted">Activity from</dt>
          <dd>
            {logged ? (
              <>
                Your logged workouts
                <span className="text-muted">
                  {" "}
                  (<span className="num">+{fmtNum(result.exerciseKcalPerDay ?? 0)}</span> kcal/day on resting × 1.2)
                </span>
              </>
            ) : (
              "Activity level"
            )}
          </dd>
        </div>
        {result.projectedDate && (
          <div className="col-span-2 sm:col-span-3">
            <dt className="text-xs leading-snug text-muted">Projected goal date</dt>
            <dd className="font-semibold">
              {fmtDate(result.projectedDate)}
              {result.projectedWeeks != null && <span className="font-normal text-muted"> (about {fmtNum(result.projectedWeeks)} weeks)</span>}
            </dd>
          </div>
        )}
      </dl>

      <div>
        <p className="mb-2 text-[0.8125rem] text-muted">Suggested macros</p>
        <div className="flex h-2.5 overflow-hidden rounded-full" aria-hidden="true">
          {macros.map((m) => (
            <span key={m.key} style={{ width: `${(m.kcal / macroKcal) * 100}%`, background: macroColors[m.key] }} />
          ))}
        </div>
        <ul className="mt-3 grid grid-cols-3 gap-2 text-[0.8125rem]">
          {macros.map((m) => (
            <li key={m.key}>
              <span className="flex items-center gap-1.5 text-xs text-muted">
                <span className="size-2 rounded-full" style={{ background: macroColors[m.key] }} aria-hidden="true" />
                {macroLabels[m.key]}
              </span>
              <span className="num mt-0.5 block whitespace-nowrap">{fmtNum(m.grams)} g</span>
            </li>
          ))}
        </ul>
      </div>

      {result.warnings.length > 0 && (
        <div role="status" className="rounded-xl border border-line bg-surface-2/70 p-3 text-[0.8125rem] leading-relaxed">
          <p className="flex items-center gap-2 font-semibold">
            <AlertTriangle className="size-4 text-warning" aria-hidden="true" />
            Check this target
          </p>
          <ul className="mt-1.5 list-disc space-y-1 pl-5 text-muted">
            {result.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-[0.6875rem] leading-relaxed text-muted">An estimate based on population formulas — not medical advice. Adjust based on your real trend over 2–3 weeks.</p>
    </div>
  );
}
