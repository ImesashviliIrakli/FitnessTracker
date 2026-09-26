import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { addDays, parseISO, startOfWeek } from "date-fns";
import { Activity, AlertTriangle, CalendarCheck, CalendarPlus, Check, ChevronRight, Circle, Dumbbell, Flame, Moon, Play, Scale, SkipForward, ThumbsUp, Timer, Trophy } from "lucide-react";
import { api, ApiError, errorMessage } from "../lib/api";
import { useUnits } from "../lib/auth";
import { fmtDelta, fmtNum, fmtShortDate, fmtWeekday, toIsoDate, today } from "../lib/format";
import type { Dashboard, PlanEntry, Session, StartSessionInput, WorkoutSummary } from "../lib/types";
import { daysElapsedThisWeek, weekDay, weeklyPace, type DayKind } from "../lib/week";
import type { Units } from "../lib/units";
import { WeightDialog } from "../components/WeightDialog";
import { Button, buttonClass, cx, ErrorState, Skeleton } from "../components/ui";
import { Badge, CapsuleBars, ColorCard, GlowLineChart, MiniSelect, OutlinedColorCard, Panel, Ring, Section, Sparkline } from "../components/dashboard-widgets";

const compact = new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 });
const weekdayShort = new Intl.DateTimeFormat(undefined, { weekday: "short" });

function ViewAll({ to, label = "View all" }: { to: string; label?: string }) {
  return (
    <Link to={to} className="link -my-1 -mr-1 flex min-h-11 shrink-0 items-center gap-0.5 rounded-lg px-1 text-[0.8125rem] whitespace-nowrap text-muted">
      {label}
      <ChevronRight className="size-4" aria-hidden="true" />
    </Link>
  );
}

/*
  DOM order is the phone order (what you check daily comes first);
  xl:order-* restores the design's desktop grid.
*/
export default function DashboardPage() {
  const u = useUnits();
  const [weighIn, setWeighIn] = useState(false);
  const dash = useQuery({ queryKey: ["dashboard"], queryFn: () => api.get<Dashboard>("/api/dashboard") });
  const workouts = useQuery({ queryKey: ["workouts"], queryFn: () => api.get<WorkoutSummary[]>("/api/workouts") });

  return (
    <>
      <h1 className="sr-only">Dashboard</h1>
      <WeightDialog open={weighIn} onClose={() => setWeighIn(false)} />
      {dash.isPending ? (
        <DashboardSkeleton />
      ) : dash.isError ? (
        <ErrorState error={dash.error} onRetry={() => dash.refetch()} />
      ) : (
        <div className="grid gap-x-8 gap-y-8 md:grid-cols-2 xl:grid-cols-12 xl:gap-y-10">
          <TodaySection d={dash.data} className="md:col-span-2 xl:order-first xl:col-span-12" />
          <OverviewSection d={dash.data} u={u} className="md:col-span-2 xl:order-2 xl:col-span-4" />
          <WeekSection d={dash.data} workouts={workouts.data} className="md:col-span-2 xl:order-8 xl:col-span-12" />
          <GoalsSection d={dash.data} u={u} className="md:col-span-2 xl:order-4 xl:col-span-8" />
          <ActivitySection d={dash.data} u={u} className="md:col-span-2 xl:order-1 xl:col-span-5" />
          <TrendSection d={dash.data} u={u} onLogWeight={() => setWeighIn(true)} className="md:col-span-2 xl:order-7 xl:col-span-6" />
          <RecentSection workouts={workouts.data} loading={workouts.isPending} u={u} className="md:col-span-2 xl:order-6 xl:col-span-6" />
          <RecordsSection d={dash.data} u={u} className="md:col-span-2 xl:order-5 xl:col-span-4" />
          <OutputSection d={dash.data} u={u} className="md:col-span-2 xl:order-3 xl:col-span-3" />
        </div>
      )}
    </>
  );
}

function DashboardSkeleton() {
  return (
    <div role="status" className="grid gap-8 md:grid-cols-2 xl:grid-cols-12">
      <span className="sr-only">Loading dashboard…</span>
      <Skeleton className="h-56 rounded-[1.25rem] xl:col-span-5" />
      <Skeleton className="h-56 rounded-[1.25rem] xl:col-span-4" />
      <Skeleton className="h-56 rounded-[1.25rem] xl:col-span-3" />
      <Skeleton className="h-64 rounded-[1.25rem] md:col-span-2 xl:col-span-12" />
    </div>
  );
}

/* ---------- Today ---------- */

const btnPrimary = buttonClass("primary");
const btnSecondary = buttonClass("secondary");

function relDay(iso: string) {
  if (iso === today()) return "today";
  if (iso === toIsoDate(addDays(new Date(), 1))) return "tomorrow";
  return fmtWeekday(iso);
}

export function TodaySection({ d, className }: { d: Dashboard; className?: string }) {
  const navigate = useNavigate();
  const [starting, setStarting] = useState(false);
  const p = d.nextPlan ?? null;

  const start = async () => {
    if (!p) return;
    setStarting(true);
    try {
      await api.post<Session>("/api/sessions", { planEntryId: p.id, templateId: null, name: null } satisfies StartSessionInput);
      navigate("/workouts/session");
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        toast("You already have a workout in progress.");
        navigate("/workouts/session");
        return;
      }
      toast.error(errorMessage(e));
      setStarting(false);
    }
  };

  return (
    <Section title="Today" className={className} action={<ViewAll to="/workouts/plan" label="Plan" />}>
      {p && p.kind !== "RestDay" ? (
        <div className="glass-accent flex flex-col gap-4 rounded-[1.25rem] border p-4 sm:flex-row sm:items-center sm:p-5">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl border border-line bg-surface-2 text-ink" aria-hidden="true">
              <CalendarCheck className="size-5" />
            </span>
            <div className="min-w-0">
              <p className="text-[0.6875rem] text-muted">Up next</p>
              <p className="mt-0.5 text-[0.9375rem] leading-snug tracking-[-0.02em] break-words sm:text-base">
                {p.templateName ?? "Planned workout"} <span className="whitespace-nowrap text-muted">· {relDay(p.date)}</span>
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex">
            <Button onClick={start} loading={starting}>
              {!starting && <Play className="size-4" aria-hidden="true" />}
              Start
            </Button>
            <Link to={`/workouts/log?plan=${p.id}`} className={btnSecondary}>
              Log manually
            </Link>
          </div>
        </div>
      ) : p ? (
        <Panel className="flex items-center gap-3">
          <Moon className="size-5 shrink-0 text-muted" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="text-[0.9375rem]">Rest day · {relDay(p.date)}</p>
            <p className="mt-0.5 text-[0.75rem] leading-relaxed text-muted">Recovery is part of the plan.</p>
          </div>
          <Link to="/workouts" className="link flex min-h-11 shrink-0 items-center text-[0.8125rem] text-muted">
            Train anyway
          </Link>
        </Panel>
      ) : (
        <Panel className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <p className="text-[0.9375rem]">Nothing planned</p>
            <p className="mt-0.5 text-[0.75rem] leading-relaxed text-muted">Start a session now, or plan your week so the next one is waiting here.</p>
          </div>
          <div className="grid gap-2 min-[480px]:grid-cols-2 sm:flex">
            <Link to="/workouts" className={btnPrimary}>
              <Play className="size-4 shrink-0" aria-hidden="true" />
              Start a workout
            </Link>
            <Link to="/workouts/plan" className={btnSecondary}>
              <CalendarPlus className="size-4 shrink-0" aria-hidden="true" />
              Plan your week
            </Link>
          </div>
        </Panel>
      )}
    </Section>
  );
}

/* ---------- Summary ---------- */

function OverviewSection({ d, u, className }: { d: Dashboard; u: Units; className?: string }) {
  const { goal: g, weight: w, training: t } = d;
  const hasGoal = g.progressPercent !== null && g.mode !== "Maintain";
  const pct = hasGoal ? g.progressPercent! : t.weeklyTarget > 0 ? Math.min(100, (t.workoutsThisWeek / t.weeklyTarget) * 100) : 0;
  const change = w.change30dKg;
  const goodChange = change === null ? null : g.mode === "Lose" ? change < 0 : g.mode === "Gain" ? change > 0 : Math.abs(change) < 0.5;
  const bmiLabel = w.bmi === null ? null : w.bmi < 18.5 ? "Underweight" : w.bmi < 25 ? "Healthy" : w.bmi < 30 ? "Overweight" : "Obese range";

  return (
    <Section title="Overview" className={className} action={<ViewAll to="/body" label="Body" />}>
      <Panel className="flex items-center gap-4 sm:gap-6">
        <Ring pct={pct} size={124}>
          <div>
            <p className="stat text-[1.625rem] leading-none">{fmtNum(pct)}%</p>
            <p className="mt-1.5 text-[0.625rem] leading-tight text-muted">{hasGoal ? "to goal" : "weekly target"}</p>
          </div>
        </Ring>
        <dl className="w-full min-w-0 flex-1 divide-y divide-line">
          <LegendRow
            label="Weight"
            value={w.latestKg !== null ? `${fmtNum(u.toWeight(w.latestKg), 1)} ${u.weight}` : "—"}
            aside={
              change !== null ? (
                <span className={cx("stat shrink-0 text-xs whitespace-nowrap", goodChange ? "text-success" : "text-muted")}>
                  {fmtDelta(u.toWeight(change))} {u.weight}
                </span>
              ) : null
            }
          />
          <LegendRow label="BMI" value={w.bmi !== null ? fmtNum(w.bmi, 1) : "—"} aside={bmiLabel && <span className="min-w-0 truncate text-[0.6875rem] text-muted">{bmiLabel}</span>} />
          <LegendRow label="Body fat" value={w.bodyFatPercent !== null ? `${fmtNum(w.bodyFatPercent, 1)}%` : "—"} />
        </dl>
      </Panel>
    </Section>
  );
}

function LegendRow({ label, value, aside }: { label: string; value: string; aside?: ReactNode }) {
  return (
    <div className="py-2 first:pt-0 last:pb-0">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5 flex flex-wrap items-baseline justify-between gap-x-2">
        <span className="stat text-[0.9375rem] tracking-[-0.02em] whitespace-nowrap sm:text-base">{value}</span>
        {aside}
      </dd>
    </div>
  );
}

/* ---------- This week ---------- */

const dayIcon: Record<DayKind, ReactNode> = {
  done: <Check className="size-3.5 text-success" strokeWidth={3} aria-hidden="true" />,
  planned: <Circle className="size-3.5 text-muted" aria-hidden="true" />,
  missed: <AlertTriangle className="size-3.5 text-warning" aria-hidden="true" />,
  skipped: <SkipForward className="size-3.5 text-muted" aria-hidden="true" />,
  rest: <Moon className="size-3.5 text-muted" aria-hidden="true" />,
  empty: null,
};
const dayStatus: Partial<Record<DayKind, string>> = { done: "Done", planned: "Planned", missed: "Missed", skipped: "Skipped" };

function WeekSection({ d, workouts, className }: { d: Dashboard; workouts?: WorkoutSummary[]; className?: string }) {
  const t = d.training;
  const todayIso = today();
  const monday = startOfWeek(new Date(), { weekStartsOn: 1 });
  const from = toIsoDate(monday);
  const to = toIsoDate(addDays(monday, 6));
  // Same key as the Plan calendar's week view, so the two share one cached request.
  const plan = useQuery({ queryKey: ["plan", from, to], queryFn: () => api.get<PlanEntry[]>(`/api/plan?from=${from}&to=${to}`) });
  const entries = plan.data ?? [];
  const days = Array.from({ length: 7 }, (_, i) => {
    const iso = toIsoDate(addDays(monday, i));
    return {
      iso,
      items: (workouts ?? []).filter((w) => w.date === iso),
      day: weekDay(iso, todayIso, workouts ?? [], entries),
      entry: entries.find((e) => e.date === iso && e.kind !== "RestDay"),
    };
  });
  const scroller = useRef<HTMLOListElement>(null);

  // On phones the week scrolls sideways; start with today in view.
  useEffect(() => {
    const el = scroller.current?.querySelector<HTMLElement>("[data-today]");
    const box = scroller.current;
    if (el && box && box.scrollWidth > box.clientWidth) box.scrollLeft = el.offsetLeft - box.clientWidth / 2 + el.clientWidth / 2;
  }, []);

  return (
    <Section
      title="This week"
      className={className}
      action={
        <span className="stat shrink-0 text-[0.8125rem] whitespace-nowrap text-muted">
          <span className="text-ink">{t.workoutsThisWeek}</span>
          {t.weeklyTarget > 0 ? ` / ${t.weeklyTarget}` : ""} sessions
        </span>
      }
    >
      {t.plannedThisWeek > 0 && (
        <div className="mb-3 flex items-center gap-3 text-[0.8125rem] text-muted">
          <span className="whitespace-nowrap">
            Plan <span className="stat text-ink">{t.completedPlannedThisWeek}</span> / {t.plannedThisWeek} done
          </span>
          <span
            role="progressbar"
            aria-label="Planned workouts completed this week"
            aria-valuemin={0}
            aria-valuemax={t.plannedThisWeek}
            aria-valuenow={t.completedPlannedThisWeek}
            className="h-1.5 max-w-48 flex-1 overflow-hidden rounded-full bg-surface-2"
          >
            <span className="block h-full rounded-full bg-accent" style={{ width: `${Math.min(100, (t.completedPlannedThisWeek / t.plannedThisWeek) * 100)}%` }} />
          </span>
        </div>
      )}
      <ol
        ref={scroller}
        className="relative -mx-4 flex snap-x snap-mandatory scroll-px-4 gap-2.5 overflow-x-auto px-4 pb-2 [scrollbar-width:none] sm:-mx-6 sm:scroll-px-6 sm:px-6 md:mx-0 md:grid md:grid-cols-7 md:gap-3 md:overflow-visible md:px-0"
      >
        {days.map(({ iso, items, day, entry }) => {
          const isToday = iso === todayIso;
          const isFuture = iso > todayIso;
          const date = parseISO(iso);
          const sets = items.reduce((s, w) => s + w.setCount, 0);
          const minutes = items.reduce((s, w) => s + (w.durationMinutes ?? 0), 0);
          const logLink = "link mt-auto -mb-1 flex min-h-11 items-end pb-1 text-[0.8125rem] leading-tight font-medium text-ink";
          return (
            <li key={iso} data-today={isToday || undefined} className="w-[7.75rem] shrink-0 snap-start md:w-auto">
              <p className={cx("mb-2 flex items-center gap-1.5 text-xs whitespace-nowrap", isToday ? "font-semibold text-ink" : "text-muted")}>
                {isToday && <span className="size-1.5 rounded-full bg-accent" aria-hidden="true" />}
                <span className="uppercase">{weekdayShort.format(date)}</span>
                <span className="num">{date.getDate()}</span>
                {isToday && <span className="sr-only">(today)</span>}
              </p>
              <div
                className={cx(
                  "flex min-h-[7.5rem] flex-col rounded-2xl border p-3 transition-colors",
                  isToday ? "border-field-line bg-surface" : isFuture ? "border-dashed border-line" : "border-line bg-surface/80",
                )}
              >
                {day.kind === "done" ? (
                  <>
                    <span className="flex items-center gap-1 text-xs text-success">
                      {dayIcon.done}
                      Done
                    </span>
                    <Link to={`/workouts/${items[0]!.id}`} className="link mt-1.5 line-clamp-2 text-[0.8125rem] leading-tight font-medium break-words">
                      {items[0]!.name}
                    </Link>
                    {items.length > 1 && <span className="mt-0.5 text-xs text-muted">+{items.length - 1} more</span>}
                    {/* Wraps to two lines in the narrow 7-column desktop week instead of overflowing the card. */}
                    <span className="num mt-auto flex flex-wrap gap-x-1.5 pt-2 text-xs leading-snug text-muted">
                      {minutes > 0 && <span className="whitespace-nowrap">{minutes}m</span>}
                      <span className="whitespace-nowrap">
                        {sets} {sets === 1 ? "set" : "sets"}
                      </span>
                    </span>
                  </>
                ) : day.kind === "empty" ? (
                  <>
                    <span className="text-xs text-muted">{day.label}</span>
                    {isToday && (
                      <Link to="/workouts/log" className={logLink}>
                        + Log workout
                      </Link>
                    )}
                  </>
                ) : day.kind === "rest" ? (
                  <span className="flex items-center gap-1 text-xs text-muted">
                    {dayIcon.rest}
                    Rest day
                  </span>
                ) : (
                  <>
                    <span className={cx("flex items-center gap-1 text-xs", day.kind === "missed" ? "text-warning" : "text-muted")}>
                      {dayIcon[day.kind]}
                      {dayStatus[day.kind]}
                    </span>
                    <span className={cx("mt-1.5 line-clamp-2 text-[0.8125rem] leading-tight break-words", day.kind === "skipped" && "text-muted line-through")}>{day.label}</span>
                    {isToday && day.kind === "planned" && entry && (
                      <Link to={`/workouts/log?plan=${entry.id}`} className={logLink}>
                        Log it
                      </Link>
                    )}
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </Section>
  );
}

/* ---------- Goals ---------- */

const paceBadge = {
  hit: { tone: "success", icon: <Flame className="size-3" aria-hidden="true" />, label: "Target hit" },
  onTrack: { tone: "neutral", icon: <ThumbsUp className="size-3" aria-hidden="true" />, label: "On track" },
  behind: { tone: "warning", icon: <AlertTriangle className="size-3" aria-hidden="true" />, label: "Behind" },
  none: { tone: "neutral", icon: <CalendarPlus className="size-3" aria-hidden="true" />, label: "No target" },
} as const;

function GoalsSection({ d, u, className }: { d: Dashboard; u: Units; className?: string }) {
  const { training: t, goal: g, calories: c, weight: w } = d;
  const pace = paceBadge[weeklyPace(t.workoutsThisWeek, t.weeklyTarget, daysElapsedThisWeek(new Date()))];
  const trend = w.series.slice(-30).map((p) => p.trendKg);
  const hasTarget = g.targetWeightKg !== null && g.mode !== "Maintain";
  const offPace = hasTarget && g.targetDateFeasible === false && !!g.targetDate;

  return (
    <Section title="Fitness goal" className={className} action={<ViewAll to="/settings#goals" label="Edit" />}>
      {/* A grid that always fits: stacked rows on phones, three columns from sm up. Every card is visible. */}
      <div className="grid gap-3 sm:grid-cols-3">
        <GoalCard
          to="/workouts"
          title="Weekly workouts"
          value={`${t.workoutsThisWeek}${t.weeklyTarget > 0 ? `/${t.weeklyTarget}` : ""}`}
          sub="this week"
          badge={
            <Badge tone={pace.tone} icon={pace.icon}>
              {pace.label}
            </Badge>
          }
          footer={<Sparkline values={t.weeks.slice(-8).map((x) => x.workouts)} className="h-10 text-chart-1" />}
        />
        <GoalCard
          to="/settings#goals"
          title={hasTarget ? "Target weight" : "Maintain"}
          value={hasTarget ? fmtNum(u.toWeight(g.targetWeightKg!), 1) : "—"}
          sub={hasTarget ? `${u.weight}${g.progressPercent !== null ? ` · ${fmtNum(g.progressPercent)}% there` : ""}` : "keep the trend steady"}
          note={
            offPace ? (
              <p className="text-xs leading-snug text-warning">
                Target date {fmtShortDate(g.targetDate!)} is before the projected {g.projectedDate ? fmtShortDate(g.projectedDate) : "date"}
                {g.requiredWeeklyRateKg !== null && ` — needs ~${fmtNum(u.toWeight(g.requiredWeeklyRateKg), 1)} ${u.weight}/week`}
              </p>
            ) : null
          }
          badge={
            offPace ? (
              <Badge tone="warning" icon={<AlertTriangle className="size-3" aria-hidden="true" />}>
                Off pace
              </Badge>
            ) : hasTarget && g.projectedDate ? (
              <Badge icon={<CalendarCheck className="size-3" aria-hidden="true" />}>By {fmtShortDate(g.projectedDate)}</Badge>
            ) : (
              <Badge icon={<Scale className="size-3" aria-hidden="true" />}>{g.mode}</Badge>
            )
          }
          footer={<Sparkline values={trend} className="h-10 text-chart-2" />}
        />
        <GoalCard
          to="/calculator"
          title="Calorie target"
          value={c ? fmtNum(c.targetCalories) : "—"}
          sub={c ? (c.activitySource === "LoggedWorkouts" ? "kcal / day · activity from your workouts" : "kcal / day") : "finish your profile"}
          badge={<Badge icon={<Flame className="size-3" aria-hidden="true" />}>{c ? (c.formula === "KatchMcArdle" ? "Katch" : "Mifflin") : "Estimate"}</Badge>}
          footer={c ? <MacroBar p={c.macros.proteinG} f={c.macros.fatG} carbs={c.macros.carbsG} /> : null}
        />
      </div>
    </Section>
  );
}

function GoalCard({
  to,
  title,
  value,
  sub,
  note,
  badge,
  footer,
}: {
  to: string;
  title: string;
  value: string;
  sub: string;
  note?: ReactNode;
  badge: ReactNode;
  footer: ReactNode;
}) {
  return (
    <Link to={to} className="group block min-w-0 rounded-[1.25rem] transition-transform active:scale-[0.99]">
      <ColorCard tone="plain" className="flex h-full flex-col overflow-hidden transition-colors group-hover:border-field-line max-sm:flex-row">
        <div className="min-w-0 flex-1 p-4">
          <p className="truncate text-[0.8125rem] text-muted">{title}</p>
          <p className="stat mt-2 truncate text-[1.625rem] leading-none">{value}</p>
          <p className="mt-1.5 line-clamp-2 text-xs leading-snug text-muted">{sub}</p>
          {note && <div className="mt-2">{note}</div>}
          <div className="mt-3 min-w-0">{badge}</div>
        </div>
        {footer && (
          <div className="flex flex-col justify-center border-line/60 px-2 pt-2 pb-3 text-muted max-sm:w-36 max-sm:shrink-0 max-sm:border-l sm:mt-auto sm:border-t">{footer}</div>
        )}
      </ColorCard>
    </Link>
  );
}

function MacroBar({ p, f, carbs }: { p: number; f: number; carbs: number }) {
  const total = p * 4 + f * 9 + carbs * 4 || 1;
  return (
    <div className="px-2">
      <div className="flex h-1.5 gap-0.5 overflow-hidden rounded-full" aria-hidden="true">
        <span className="rounded-full bg-chart-1" style={{ width: `${((p * 4) / total) * 100}%` }} />
        <span className="rounded-full bg-chart-3" style={{ width: `${((f * 9) / total) * 100}%` }} />
        <span className="rounded-full bg-chart-2" style={{ width: `${((carbs * 4) / total) * 100}%` }} />
      </div>
      <p className="num mt-2 flex flex-wrap gap-x-2 text-xs whitespace-nowrap text-muted">
        <span className="flex items-center gap-1"><span className="size-1.5 rounded-full bg-chart-1" aria-hidden="true" />P {p}g</span>
        <span className="flex items-center gap-1"><span className="size-1.5 rounded-full bg-chart-3" aria-hidden="true" />F {f}g</span>
        <span className="flex items-center gap-1"><span className="size-1.5 rounded-full bg-chart-2" aria-hidden="true" />C {carbs}g</span>
      </p>
    </div>
  );
}

/* ---------- Activity & trend ---------- */

function ActivitySection({ d, u, className }: { d: Dashboard; u: Units; className?: string }) {
  const [mode, setMode] = useState<"workouts" | "volume">("workouts");
  const t = d.training;
  const weeks = t.weeks.slice(-8);
  const maxVolume = Math.max(1, ...weeks.map((w) => w.volumeKg));
  const maxWorkouts = Math.max(1, ...weeks.map((w) => w.workouts));
  const byTarget = mode === "workouts" && t.weeklyTarget > 0;

  const items = weeks.map((w, i) => {
    const pct = mode === "volume" ? (w.volumeKg / maxVolume) * 100 : byTarget ? (w.workouts / t.weeklyTarget) * 100 : (w.workouts / maxWorkouts) * 100;
    return {
      key: w.weekStart,
      label: fmtShortDate(w.weekStart),
      pct: Math.min(100, pct),
      caption: mode === "volume" ? compact.format(u.toWeight(w.volumeKg)) : byTarget ? `${fmtNum(Math.min(pct, 999))}%` : fmtNum(w.workouts),
      current: i === weeks.length - 1,
      hideOnPhone: i < weeks.length - 6,
    };
  });
  const summary =
    mode === "volume"
      ? `Training volume per week, last ${weeks.length} weeks: ${weeks.map((w) => `${fmtNum(u.toWeight(w.volumeKg))} ${u.weight}`).join(", ")}.`
      : `Workouts per week, last ${weeks.length} weeks: ${weeks.map((w) => w.workouts).join(", ")}${byTarget ? ` against a target of ${t.weeklyTarget}` : ""}.`;

  return (
    <Section
      title="Activity"
      className={className}
      action={
        <MiniSelect
          label="Activity measure"
          value={mode}
          onChange={setMode}
          options={[
            { value: "workouts", label: t.weeklyTarget > 0 ? "Vs. target" : "Workouts" },
            { value: "volume", label: "Volume" },
          ]}
        />
      }
    >
      <Panel className="px-3 sm:px-6">
        <CapsuleBars items={items} summary={summary} />
      </Panel>
    </Section>
  );
}

function TrendSection({ d, u, onLogWeight, className }: { d: Dashboard; u: Units; onLogWeight: () => void; className?: string }) {
  const [range, setRange] = useState<"30" | "90">("90");
  const from = toIsoDate(addDays(new Date(), -Number(range)));
  const data = d.weight.series.filter((p) => p.date >= from).map((p) => ({ date: p.date, value: u.toWeight(p.trendKg) }));
  const logged = d.weight.latestKg !== null ? u.toWeight(d.weight.latestKg) : null;
  return (
    <Section
      title="Weight trend"
      className={className}
      action={
        <MiniSelect
          label="Weight trend range"
          value={range}
          onChange={setRange}
          options={[
            { value: "30", label: "30 days" },
            { value: "90", label: "90 days" },
          ]}
        />
      }
    >
      <Panel className="px-1 pt-2 pb-3 sm:px-3 sm:pt-3 sm:pb-4">
        {data.length >= 2 ? (
          <GlowLineChart data={data} unit={u.weight} logged={logged} height={210} />
        ) : (
          <div className="flex h-[210px] flex-col items-start justify-center gap-3 px-3">
            <Scale className="size-6 text-muted" aria-hidden="true" />
            <p className="text-[0.9375rem]">Your trend line starts here</p>
            <p className="text-[0.8125rem] leading-relaxed text-muted">Log your weight a few mornings a week. After two weigh-ins you’ll see a smoothed trend.</p>
            <Button size="sm" variant="secondary" onClick={onLogWeight}>
              Log Weight
            </Button>
          </div>
        )}
      </Panel>
    </Section>
  );
}

/* ---------- History ---------- */

function RecentSection({ workouts, loading, u, className }: { workouts?: WorkoutSummary[]; loading: boolean; u: Units; className?: string }) {
  const icons = [Dumbbell, Activity, Timer];
  const recent = (workouts ?? []).slice(0, 4);
  return (
    <Section title="Recent workouts" className={className} action={<ViewAll to="/workouts" />}>
      <Panel className="p-1.5 sm:p-2">
        {loading ? (
          <div className="space-y-2 p-2">
            <Skeleton className="h-14" />
            <Skeleton className="h-14" />
            <Skeleton className="h-14" />
          </div>
        ) : recent.length === 0 ? (
          <div className="flex min-h-48 flex-col items-start justify-center gap-3 p-4">
            <Dumbbell className="size-6 text-muted" aria-hidden="true" />
            <p className="text-[0.9375rem]">No workouts yet</p>
            <p className="text-[0.8125rem] leading-relaxed text-muted">Strength, cardio, mobility or sport: every session builds your streak and volume history.</p>
            <Link to="/workouts" className="link flex min-h-11 items-center text-[0.8125rem] font-medium">
              Log your first workout →
            </Link>
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {recent.map((w, i) => {
              const Icon = icons[i % icons.length]!;
              const metric =
                w.totalVolumeKg > 0
                  ? { value: `${compact.format(u.toWeight(w.totalVolumeKg))} ${u.weight}`, label: "volume" }
                  : w.estimatedCalories
                    ? { value: `${fmtNum(w.estimatedCalories)} kcal`, label: "burned" }
                    : { value: `${w.setCount}`, label: w.setCount === 1 ? "set" : "sets" };
              return (
                <li key={w.id}>
                  <Link to={`/workouts/${w.id}`} className="flex items-center gap-3 rounded-2xl p-2.5 transition-colors hover:bg-surface-2 active:bg-surface-2 sm:gap-4 sm:p-3">
                    <span
                      className="grid size-10 shrink-0 place-items-center rounded-xl border border-line bg-surface-2 text-ink/80 sm:size-11"
                      aria-hidden="true"
                    >
                      <Icon className="size-[1.125rem]" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[0.9375rem] font-medium">{w.name}</span>
                      <span className="mt-0.5 block truncate text-xs text-muted">
                        {fmtWeekday(w.date)}
                        {w.durationMinutes ? ` · ${w.durationMinutes} min` : ""}
                        <span className="max-sm:hidden xl:hidden 2xl:inline">
                          {" "}
                          · {w.exerciseCount} {w.exerciseCount === 1 ? "exercise" : "exercises"}
                        </span>
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="stat block text-[0.9375rem] whitespace-nowrap">{metric.value}</span>
                      <span className="mt-0.5 block text-xs text-muted">{metric.label}</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </Section>
  );
}

function RecordsSection({ d, u, className }: { d: Dashboard; u: Units; className?: string }) {
  const records = d.recentRecords.slice(0, 2);
  return (
    <Section title="Records" className={className} action={<ViewAll to="/records" />}>
      {records.length === 0 ? (
        <Panel className="flex min-h-48 flex-col items-start justify-center gap-3">
          <Trophy className="size-6 text-muted" aria-hidden="true" />
          <p className="text-[0.9375rem]">No records yet</p>
          <p className="text-[0.8125rem] leading-relaxed text-muted">Log strength sets and your best lifts and estimated 1RMs show up here automatically.</p>
        </Panel>
      ) : (
        <div className="grid gap-3 min-[400px]:grid-cols-2">
          {records.map((r) => (
            <OutlinedColorCard key={`${r.exerciseId}-${r.date}`} tone="plain" className="relative flex min-h-[11rem] flex-col overflow-hidden p-4">
              {/* Watermark sits in the top corner, clear of the numbers. */}
              <Trophy className="absolute top-3 right-3 size-8 text-warning/25" aria-hidden="true" />
              <p className="line-clamp-2 pr-9 text-[0.9375rem] leading-tight font-medium break-words">{r.exerciseName}</p>
              <p className="mt-1 text-xs leading-tight text-muted">Personal best</p>
              <div className="mt-auto pt-4">
                <p className="stat text-[1.625rem] leading-none whitespace-nowrap">
                  {fmtNum(u.toWeight(r.weightKg), 1)}
                  <span className="ml-1 text-sm font-normal text-muted">{u.weight}</span>
                  {r.reps != null && (
                    <>
                      <span className="mx-1 text-base font-normal text-muted">×</span>
                      {r.reps}
                    </>
                  )}
                </p>
                <p className="num mt-2 flex flex-wrap gap-x-2 text-xs leading-snug text-muted">
                  {r.estimated1Rm !== null && <span className="whitespace-nowrap">e1RM {fmtNum(u.toWeight(r.estimated1Rm), 1)}</span>}
                  <span className="whitespace-nowrap">{fmtShortDate(r.date)}</span>
                </p>
              </div>
            </OutlinedColorCard>
          ))}
        </div>
      )}
    </Section>
  );
}

function OutputSection({ d, u, className }: { d: Dashboard; u: Units; className?: string }) {
  const t = d.training;
  const thisWeek = t.weeks.at(-1);
  return (
    <Section title="Output" className={className}>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
        <OutlinedColorCard tone="plain" className="flex items-center gap-3 p-3.5 sm:gap-4 sm:p-4">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl border border-line bg-surface-2 text-warning" aria-hidden="true">
            <Flame className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[0.8125rem] text-muted">Week streak</p>
            <p className="stat mt-0.5 truncate text-xl leading-tight">
              {t.weekStreak} <span className="text-sm font-normal text-muted">{t.weekStreak === 1 ? "week" : "weeks"}</span>
            </p>
          </div>
        </OutlinedColorCard>
        <OutlinedColorCard tone="plain" className="flex items-center gap-3 p-3.5 sm:gap-4 sm:p-4">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl border border-line bg-surface-2 text-ink/80" aria-hidden="true">
            <Dumbbell className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[0.8125rem] text-muted">Volume this week</p>
            <p className="stat mt-0.5 truncate text-xl leading-tight">
              {compact.format(u.toWeight(thisWeek?.volumeKg ?? 0))} <span className="text-sm font-normal text-muted">{u.weight}</span>
            </p>
          </div>
        </OutlinedColorCard>
      </div>
    </Section>
  );
}
