import { useEffect, useRef } from "react";
import { Link } from "react-router";
import { CalendarCheck, Flame, Trophy } from "lucide-react";
import { useUnits } from "../../lib/auth";
import { fmtNum, fmtWeekday, today } from "../../lib/format";
import type { SessionSummary } from "../../lib/types";

const btn = "inline-flex h-12 flex-1 items-center justify-center rounded-xl px-5 text-[0.875rem] whitespace-nowrap sm:h-11 sm:flex-none";

function Stat({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="rounded-2xl border border-line bg-surface px-4 py-3.5">
      <dt className="text-[0.6875rem] text-muted">{label}</dt>
      <dd className="mt-1.5 truncate">
        <span className="stat text-[1.375rem] leading-none sm:text-[1.625rem]">{value}</span>
        {unit && <span className="ml-1 text-[0.75rem] text-muted">{unit}</span>}
      </dd>
    </div>
  );
}

/** Post-workout screen: what was done, what improved, where the week stands, what's next. */
export function SessionSummaryView({ summary }: { summary: SessionSummary }) {
  const u = useUnits();
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);
  const s = summary;
  const goalPct = s.weeklyTarget ? Math.min(100, (s.workoutsThisWeek / s.weeklyTarget) * 100) : 0;

  return (
    <div className="mx-auto max-w-2xl pb-6">
      <header className="mb-6 pt-2 text-center sm:mb-8">
        <p className="text-[0.6875rem] tracking-[0.12em] text-accent-fg uppercase">Workout complete</p>
        <h1
          ref={heading}
          tabIndex={-1}
          title={s.workout.name}
          className="mt-2 line-clamp-3 text-[1.625rem] leading-tight [overflow-wrap:anywhere] focus:outline-none sm:text-[2rem]"
        >
          {s.workout.name}
        </h1>
        <p className="mt-1.5 text-[0.8125rem] text-muted">{s.prs.length ? "New bests today. Nicely done." : "Logged. Consistency is the whole game."}</p>
      </header>

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Time" value={fmtNum(s.durationMinutes)} unit="min" />
        <Stat label="Sets done" value={fmtNum(s.setsDone)} />
        <Stat label="Volume" value={fmtNum(u.toWeight(s.totalVolumeKg))} unit={u.weight} />
        <Stat label="Est. calories" value={s.estimatedCalories === null ? "–" : fmtNum(s.estimatedCalories)} unit={s.estimatedCalories === null ? undefined : "kcal"} />
      </dl>

      {s.prs.length > 0 && (
        <section aria-labelledby="prs" className="mt-4 rounded-[1.25rem] border border-accent/30 bg-accent/10 p-4 sm:p-5">
          <h2 id="prs" className="flex items-center gap-2 text-[0.9375rem]">
            <Trophy className="size-4 text-accent-fg motion-safe:animate-[pulse_2s_ease-in-out_2]" aria-hidden="true" />
            {s.prs.length === 1 ? "Personal record" : `${s.prs.length} personal records`}
          </h2>
          <ul className="mt-3 space-y-2.5">
            {s.prs.map((p) => (
              <li key={`${p.exerciseId}-${p.kind}`} className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 truncate text-[0.8125rem]" title={p.exerciseName}>
                  {p.exerciseName}
                  <span className="ml-1.5 text-[0.6875rem] text-muted">{p.kind === "Weight" ? "heaviest" : "est. 1RM"}</span>
                </span>
                <span className="num shrink-0 text-[0.8125rem] whitespace-nowrap">
                  <span className="stat text-accent-fg">
                    {fmtNum(u.toWeight(p.value), 1)} {u.weight}
                  </span>
                  {p.previous !== null && <span className="ml-1.5 text-[0.6875rem] text-muted">was {fmtNum(u.toWeight(p.previous), 1)}</span>}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <section aria-label="This week" className="rounded-[1.25rem] border border-line bg-surface p-4">
          <p className="flex items-center gap-2 text-[0.75rem] text-muted">
            <Flame className="size-4 text-warning" aria-hidden="true" />
            {s.weekStreak} {s.weekStreak === 1 ? "week" : "weeks"} in a row
          </p>
          <p className="mt-3 text-[0.8125rem]">
            <span className="stat text-[1.25rem]">{s.workoutsThisWeek}</span>
            <span className="text-muted"> of {s.weeklyTarget} workouts this week</span>
          </p>
          <div
            role="progressbar"
            aria-label="Weekly goal"
            aria-valuemin={0}
            aria-valuemax={s.weeklyTarget}
            aria-valuenow={s.workoutsThisWeek}
            className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-surface-2"
          >
            <div className="h-full rounded-full bg-accent" style={{ width: `${goalPct}%` }} />
          </div>
        </section>
        <section aria-label="Next planned workout" className="rounded-[1.25rem] border border-line bg-surface p-4">
          <p className="flex items-center gap-2 text-[0.75rem] text-muted">
            <CalendarCheck className="size-4 text-accent-fg" aria-hidden="true" />
            Up next
          </p>
          {s.nextPlan ? (
            <>
              <p className="mt-3 truncate text-[0.9375rem]" title={s.nextPlan.templateName ?? undefined}>
                {s.nextPlan.templateName ?? "Planned workout"}
              </p>
              <p className="mt-0.5 text-[0.75rem] text-muted">{s.nextPlan.date === today() ? "Today" : fmtWeekday(s.nextPlan.date)}</p>
            </>
          ) : (
            <p className="mt-3 text-[0.8125rem] leading-relaxed text-muted">
              Nothing planned.{" "}
              <Link to="/workouts/plan" className="text-accent-fg underline-offset-4 hover:underline">
                Plan your next one
              </Link>
            </p>
          )}
        </section>
      </div>

      <div className="mt-7 flex gap-2 sm:justify-center">
        <Link to={`/workouts/${s.workout.id}`} className={`${btn} border border-line bg-surface-2/70 hover:border-muted/40`}>
          View Workout
        </Link>
        <Link to="/" className={`${btn} glow bg-accent text-accent-ink hover:brightness-110`}>
          Done
        </Link>
      </div>
    </div>
  );
}
