import { useMemo, useState } from "react";
import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { parseISO, startOfWeek } from "date-fns";
import { CalendarDays, ChevronRight, Dumbbell, PenLine, Play, Repeat } from "lucide-react";
import { api } from "../lib/api";
import { useUnits } from "../lib/auth";
import { fmtNum, fmtShortDate, fmtWeekday, toIsoDate } from "../lib/format";
import type { Session, WorkoutSummary } from "../lib/types";
import { Button, EmptyState, ErrorState, Loading, PageHeader, Skeleton } from "../components/ui";
import { StartWorkoutDialog } from "../features/session/StartWorkoutDialog";
import { useActiveSession, useNow } from "../features/session/useSessionDraft";
import { elapsedSeconds, fmtClock, progress } from "../features/session/session";

const tile =
  "flex min-h-[4.5rem] items-center gap-3.5 rounded-[1.25rem] border border-line bg-surface px-4 py-3 transition-colors hover:border-accent/40";

export default function WorkoutsPage() {
  const [starting, setStarting] = useState(false);
  const active = useActiveSession();

  return (
    <>
      <PageHeader title="Workouts" />

      <div className="grid gap-3 md:grid-cols-[1.4fr_1fr]">
        {active.isPending ? (
          <Skeleton className="h-32 rounded-[1.25rem] md:row-span-2 md:h-auto" />
        ) : active.data ? (
          <ResumeCard session={active.data} />
        ) : (
          <button
            type="button"
            onClick={() => setStarting(true)}
            className="glass-accent glow group flex min-h-32 flex-col justify-between gap-4 rounded-[1.25rem] border p-5 text-left transition-[filter] hover:brightness-110 md:row-span-2"
          >
            <span className="grid size-12 place-items-center rounded-2xl bg-accent text-accent-ink">
              <Play className="size-5" aria-hidden="true" />
            </span>
            <span>
              <span className="block text-[1.25rem] leading-tight sm:text-[1.5rem]">Start Workout</span>
              <span className="mt-1 block text-[0.75rem] text-muted sm:text-[0.8125rem]">Follow your plan, a template, or go freestyle.</span>
            </span>
          </button>
        )}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-1">
          <Link to="/workouts/plan" className={tile}>
            <CalendarDays className="size-5 shrink-0 text-accent-fg" aria-hidden="true" />
            <span className="min-w-0 flex-1 text-[0.8125rem] leading-snug sm:text-[0.875rem]">Plan Workouts</span>
            <ChevronRight className="size-4 shrink-0 text-muted max-sm:hidden" aria-hidden="true" />
          </Link>
          <Link to="/workouts/log" className={tile}>
            <PenLine className="size-5 shrink-0 text-accent-fg" aria-hidden="true" />
            <span className="min-w-0 flex-1 text-[0.8125rem] leading-snug sm:text-[0.875rem]">Add Workout Manually</span>
            <ChevronRight className="size-4 shrink-0 text-muted max-sm:hidden" aria-hidden="true" />
          </Link>
        </div>
      </div>
      {active.isError && (
        <div className="mt-3">
          <ErrorState error={new Error("Couldn’t check for a workout in progress.")} onRetry={() => active.refetch()} />
        </div>
      )}

      <History onStart={() => setStarting(true)} canStart={!active.data} />
      <StartWorkoutDialog open={starting} onClose={() => setStarting(false)} />
    </>
  );
}

function ResumeCard({ session }: { session: Session }) {
  const now = useNow();
  const { done, total } = progress(session);
  const pct = total ? (done / total) * 100 : 0;
  return (
    <Link
      to="/workouts/session"
      className="glass-accent glow flex min-h-32 min-w-0 flex-col justify-between gap-4 rounded-[1.25rem] border p-5 transition-[filter] hover:brightness-110 md:row-span-2"
    >
      <span className="flex items-start justify-between gap-3">
        <span className="min-w-0">
          <span className="flex items-center gap-2 text-[0.6875rem] tracking-[0.08em] text-accent-fg uppercase">
            <span className="size-2 rounded-full bg-accent motion-safe:animate-pulse" aria-hidden="true" />
            In progress
          </span>
          <span className="mt-1.5 block truncate text-[1.25rem] leading-tight sm:text-[1.5rem]" title={session.name}>
            {session.name}
          </span>
        </span>
        <span className="flex h-11 shrink-0 items-center gap-1.5 rounded-xl bg-accent px-4 text-[0.8125rem] text-accent-ink">
          <Play className="size-3.5" aria-hidden="true" />
          Resume
        </span>
      </span>
      <span className="block">
        <span className="num flex flex-wrap gap-x-2 text-[0.8125rem] text-muted">
          <span>
            <span className="stat text-ink">{fmtClock(elapsedSeconds(session.startedAt, now))}</span> elapsed
          </span>
          <span aria-hidden="true">·</span>
          <span>
            <span className="stat text-ink">
              {done}/{total}
            </span>{" "}
            sets
          </span>
        </span>
        <span className="mt-2.5 block h-1 overflow-hidden rounded-full bg-surface-2" aria-hidden="true">
          <span className="block h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
        </span>
      </span>
    </Link>
  );
}

function History({ onStart, canStart }: { onStart: () => void; canStart: boolean }) {
  const u = useUnits();
  const q = useQuery({ queryKey: ["workouts"], queryFn: () => api.get<WorkoutSummary[]>("/api/workouts") });

  // Group by ISO week (Monday start), newest first — the API already sorts newest first.
  const weeks = useMemo(() => {
    const map = new Map<string, WorkoutSummary[]>();
    for (const w of q.data ?? []) {
      const key = toIsoDate(startOfWeek(parseISO(w.date), { weekStartsOn: 1 }));
      map.set(key, [...(map.get(key) ?? []), w]);
    }
    return [...map.entries()];
  }, [q.data]);

  return (
    <section aria-labelledby="history" className="mt-10">
      <h2 id="history" className="mb-4 text-[1.0625rem] sm:text-[1.25rem]">
        History
      </h2>
      {q.isPending ? (
        <Loading />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : weeks.length === 0 ? (
        <EmptyState
          icon={<Dumbbell className="size-6" />}
          title="No workouts yet"
          action={
            canStart && (
              <Button variant="secondary" onClick={onStart}>
                <Play className="size-4" aria-hidden="true" />
                Start Your First Workout
              </Button>
            )
          }
        >
          Finished sessions and manual logs land here, grouped by week. Your records and streaks build from them.
        </EmptyState>
      ) : (
        <div className="space-y-7">
          {weeks.map(([weekStart, list]) => {
            const volume = list.reduce((s, w) => s + w.totalVolumeKg, 0);
            return (
              <section key={weekStart} aria-labelledby={`wk-${weekStart}`}>
                <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                  <h3 id={`wk-${weekStart}`} className="text-[0.8125rem] sm:text-[0.875rem]">
                    Week of {fmtShortDate(weekStart)}
                  </h3>
                  <p className="num text-[0.6875rem] text-muted sm:text-[0.75rem]">
                    {list.length} {list.length === 1 ? "workout" : "workouts"}
                    {volume > 0 && ` · ${fmtNum(u.toWeight(volume))} ${u.weight}`}
                  </p>
                </div>
                <ul className="divide-y divide-line overflow-hidden rounded-[1.25rem] border border-line bg-surface">
                  {list.map((w) => (
                    <li key={w.id} className="flex items-center">
                      <Link to={`/workouts/${w.id}`} className="flex min-w-0 flex-1 items-center gap-4 py-3 pl-4 hover:bg-surface-2 sm:pr-4">
                        <span className="hidden w-28 shrink-0 text-[0.8125rem] text-muted sm:block">{fmtWeekday(w.date)}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-[0.6875rem] text-muted sm:hidden">{fmtWeekday(w.date)}</span>
                          <span className="block truncate text-[0.875rem]" title={w.name}>
                            {w.name}
                          </span>
                          <span className="num mt-0.5 block truncate text-[0.6875rem] text-muted sm:text-[0.75rem]">
                            {[
                              `${w.exerciseCount} ${w.exerciseCount === 1 ? "exercise" : "exercises"}`,
                              `${w.setCount} ${w.setCount === 1 ? "set" : "sets"}`,
                              w.durationMinutes && `${w.durationMinutes} min`,
                              w.totalVolumeKg > 0 && `${fmtNum(u.toWeight(w.totalVolumeKg))} ${u.weight}`,
                              w.estimatedCalories && `≈${fmtNum(w.estimatedCalories)} kcal`,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                        </span>
                      </Link>
                      <Link
                        to={`/workouts/log?repeat=${w.id}`}
                        aria-label={`Repeat ${w.name}`}
                        title="Repeat this workout"
                        className="mr-1 grid size-11 shrink-0 place-items-center rounded-xl text-muted hover:bg-surface-2 hover:text-ink sm:mr-2"
                      >
                        <Repeat className="size-4" aria-hidden="true" />
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </section>
  );
}
