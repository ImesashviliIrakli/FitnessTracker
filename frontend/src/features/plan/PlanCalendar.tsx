import { useId, useMemo, useState, type DragEvent, type ReactNode } from "react";
import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { isSameMonth } from "date-fns";
import { z } from "zod";
import { toast } from "sonner";
import { CalendarX2, Check, ChevronLeft, ChevronRight, GripVertical, Moon, Play, Plus, Repeat } from "lucide-react";
import { api, applyFieldErrors, errorMessage } from "../../lib/api";
import { fmtShortDate, fmtWeekday, toIsoDate, today } from "../../lib/format";
import type { PlanEntry, PlanEntryUpdate, WorkoutSummary } from "../../lib/types";
import { DateField } from "../../components/DatePicker";
import { Button, buttonClass, ConfirmDialog, cx, Dialog, EmptyState, ErrorState, Field, Segmented, Select, Skeleton, Textarea } from "../../components/ui";
import { adherence, groupByDay, monthWeeks, rangeDays, rangeParams, shiftAnchor, type CalView, type DayItems } from "./calendar";
import { ScheduleSheet, type ScheduleTarget } from "./ScheduleSheet";
import { entryTone, templatesQuery, toneClass, toneIcon, toneIconClass, toneLabel, useStartSession, type Tone } from "./shared";

const TEMPLATE_MIME = "application/x-fittrack-template";
const ENTRY_MIME = "application/x-fittrack-entry";
const monthFmt = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" });
const fullFmt = new Intl.DateTimeFormat(undefined, { weekday: "long", day: "numeric", month: "long" });
const wdFmt = new Intl.DateTimeFormat(undefined, { weekday: "short" });
const weekdayHeads = rangeDays("week", new Date(2024, 0, 1)).map((d) => ({ short: wdFmt.format(d), long: new Intl.DateTimeFormat(undefined, { weekday: "long" }).format(d) }));
const empty: DayItems = { entries: [], extra: [] };

const initialView = (): CalView => (typeof window !== "undefined" && window.matchMedia?.("(min-width: 768px)").matches ? "month" : "week");

/** Screen-reader summary of a day, e.g. "Push A, planned; Easy run, logged". */
function describe(items: DayItems, now: string) {
  const parts = [
    ...items.entries.map((e) => `${e.templateName ?? "Deleted template"}, ${toneLabel[entryTone(e, now)].toLowerCase()}`),
    ...items.extra.map((w) => `${w.name}, logged`),
  ];
  return parts.length ? parts.join("; ") : "nothing planned";
}

export function PlanCalendar() {
  const [view, setView] = useState<CalView>(initialView);
  const [anchor, setAnchor] = useState(() => new Date());
  const [schedule, setSchedule] = useState<ScheduleTarget | null>(null);
  const [entry, setEntry] = useState<PlanEntry | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const now = today();

  const { from, to } = rangeParams(view, anchor);
  const plan = useQuery({ queryKey: ["plan", from, to], queryFn: () => api.get<PlanEntry[]>(`/api/plan?from=${from}&to=${to}`) });
  const workouts = useQuery({ queryKey: ["workouts", from, to], queryFn: () => api.get<WorkoutSummary[]>(`/api/workouts?from=${from}&to=${to}`) });
  const templates = useQuery(templatesQuery);

  const entries = useMemo(() => plan.data ?? [], [plan.data]);
  const byDay = useMemo(() => groupByDay(entries, workouts.data ?? []), [entries, workouts.data]);
  const stats = useMemo(() => adherence(entries, workouts.data ?? [], now), [entries, workouts.data, now]);
  const itemsOn = (iso: string) => byDay.get(iso) ?? empty;

  const title = view === "month" ? monthFmt.format(anchor) : `${fmtShortDate(from)} – ${fmtShortDate(to)}`;

  // Desktop drag-and-drop: templates from the palette add an entry, entries move to another day.
  // Keyboard/touch alternative: the day's quick-add sheet and the entry sheet's date field.
  const dropProps = (iso: string) => ({
    onDragOver: (e: DragEvent) => {
      const types = e.dataTransfer.types;
      if (!types.includes(TEMPLATE_MIME) && !types.includes(ENTRY_MIME)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = types.includes(ENTRY_MIME) ? "move" : "copy";
      if (over !== iso) setOver(iso);
    },
    onDragLeave: (e: DragEvent) => {
      if (!(e.currentTarget as Node).contains(e.relatedTarget as Node | null)) setOver((o) => (o === iso ? null : o));
    },
    onDrop: async (e: DragEvent) => {
      e.preventDefault();
      setOver(null);
      const templateId = e.dataTransfer.getData(TEMPLATE_MIME);
      const entryId = e.dataTransfer.getData(ENTRY_MIME);
      try {
        if (templateId) {
          await api.post<PlanEntry>("/api/plan", { templateId, date: iso, note: null });
          toast.success(`${templates.data?.find((t) => t.id === templateId)?.name ?? "Workout"} planned for ${fmtWeekday(iso)}`);
        } else if (entryId) {
          const en = entries.find((x) => x.id === entryId);
          if (!en || !en.templateId || en.date === iso || en.status === "Completed") return;
          const body: PlanEntryUpdate = { date: iso, templateId: en.templateId, note: en.note, status: en.status === "Skipped" ? "Skipped" : "Planned" };
          await api.put<PlanEntry>(`/api/plan/${en.id}`, body);
          toast.success(`${en.templateName ?? "Entry"} moved to ${fmtWeekday(iso)}`);
        }
      } catch (err) {
        toast.error(errorMessage(err));
      }
    },
  });

  const openDay = (iso: string) => setSchedule({ date: iso });
  const loading = plan.isPending || workouts.isPending;
  const error = plan.error ?? workouts.error;

  let body: ReactNode;
  if (error) body = <ErrorState error={error} onRetry={() => void (plan.refetch(), workouts.refetch())} />;
  else if (loading) body = <Skeleton className={view === "month" ? "h-[28rem]" : "h-[32rem]"} />;
  else if (view === "month")
    body = <MonthGrid anchor={anchor} title={title} now={now} itemsOn={itemsOn} over={over} dropProps={dropProps} onDay={openDay} onEntry={setEntry} />;
  else {
    const days = rangeDays(view, anchor).filter((d) => view === "week" || itemsOn(toIsoDate(d)) !== empty || toIsoDate(d) === now);
    body =
      days.length === 0 ? (
        <EmptyState icon={<CalendarX2 className="size-6" />} title="Nothing in these two weeks" action={<Button variant="secondary" onClick={() => openDay(from)}>Plan a Day</Button>}>
          Put a template on a day, or step forward to see what’s next.
        </EmptyState>
      ) : (
        <ol className="space-y-2" aria-label={title}>
          {days.map((d) => {
            const iso = toIsoDate(d);
            return <DayRow key={iso} d={d} now={now} items={itemsOn(iso)} over={over === iso} dropProps={dropProps(iso)} onAdd={() => openDay(iso)} onEntry={setEntry} />;
          })}
        </ol>
      );
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="flex shrink-0 items-center gap-1">
          <NavButton label={`Previous ${view === "agenda" ? "two weeks" : view}`} onClick={() => setAnchor((a) => shiftAnchor(view, a, -1))}>
            <ChevronLeft className="size-4" aria-hidden="true" />
          </NavButton>
          <Button size="sm" variant="secondary" onClick={() => setAnchor(new Date())}>
            Today
          </Button>
          <NavButton label={`Next ${view === "agenda" ? "two weeks" : view}`} onClick={() => setAnchor((a) => shiftAnchor(view, a, 1))}>
            <ChevronRight className="size-4" aria-hidden="true" />
          </NavButton>
        </div>
        <h2 className="min-w-0 flex-1 truncate text-[0.9375rem] sm:text-lg" aria-live="polite">
          {title}
        </h2>
        <div className="flex w-full items-center justify-between gap-2 lg:w-auto">
          <Segmented<CalView>
            label="Calendar view"
            value={view}
            onChange={setView}
            options={[
              { value: "month", label: "Month" },
              { value: "week", label: "Week" },
              { value: "agenda", label: "List" },
            ]}
          />
          <Button size="sm" onClick={() => setSchedule({ date: now >= from && now <= to ? now : from })} aria-label="Schedule a workout">
            <Plus className="size-4" aria-hidden="true" />
            <span className="max-[400px]:hidden">Schedule</span>
          </Button>
        </div>
      </div>

      <Summary stats={stats} loading={loading} />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_15rem]">
        <div className="min-w-0">
          {body}
          <Legend />
        </div>
        <Palette templates={templates.data} onPick={(templateId) => setSchedule({ templateId, date: now })} />
      </div>

      <ScheduleSheet
        target={schedule}
        onClose={() => setSchedule(null)}
        dayItems={schedule?.date && !schedule.templateId ? itemsOn(schedule.date) : undefined}
        onOpenEntry={(e) => {
          setSchedule(null);
          setEntry(e);
        }}
      />
      <Dialog open={entry !== null} onClose={() => setEntry(null)} title={entry?.templateName ?? "Planned day"}>
        {entry && <EntrySheet entry={entry} onClose={() => setEntry(null)} />}
      </Dialog>
    </>
  );
}

function NavButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="grid size-11 place-items-center rounded-xl text-muted transition-colors hover:bg-surface-2 hover:text-ink sm:size-9"
    >
      {children}
    </button>
  );
}

function Summary({ stats, loading }: { stats: ReturnType<typeof adherence>; loading: boolean }) {
  const cells: { label: string; value: ReactNode; className?: string }[] = [
    { label: "Done", value: stats.completed, className: "text-success" },
    { label: "Skipped", value: stats.skipped, className: "text-muted" },
    { label: "Missed", value: stats.missed, className: stats.missed ? "text-warning" : "text-muted" },
    { label: "Upcoming", value: stats.upcoming, className: "text-info" },
    { label: "Unplanned", value: stats.extra },
  ];
  return (
    <section aria-label="Planned versus done in this range" className="mb-4 rounded-[1.25rem] border border-line bg-surface p-3 sm:p-4">
      <dl className="grid grid-cols-3 items-end gap-x-3 gap-y-3 sm:grid-cols-[1.6fr_repeat(5,1fr)]">
        <div className="min-w-0">
          <dt className="text-[0.6875rem] text-muted">On track</dt>
          <dd className="stat text-xl leading-tight sm:text-2xl">{loading || stats.percent === null ? "–" : `${stats.percent}%`}</dd>
          <dd className="mt-1.5 h-1.5 w-full max-w-40 overflow-hidden rounded-full bg-surface-2" aria-hidden="true">
            <div className="h-full rounded-full bg-accent motion-safe:transition-[width]" style={{ width: `${stats.percent ?? 0}%` }} />
          </dd>
        </div>
        {cells.map((c) => (
          <div key={c.label} className="min-w-0">
            <dt className="truncate text-[0.6875rem] text-muted">{c.label}</dt>
            <dd className={cx("stat text-base leading-tight", c.className)}>{loading ? "–" : c.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

const legendTones: Tone[] = ["done", "planned", "skipped", "missed", "rest"];

/** Status key: an icon and a word for each status (the calendar never relies on colour alone). */
export function Legend() {
  return (
    <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted" aria-label="Legend">
      {legendTones.map((tone) => (
        <li key={tone} className="flex items-center gap-1.5">
          <ToneIcon tone={tone} />
          {toneLabel[tone]}
        </li>
      ))}
      <li className="flex items-center gap-1.5">
        <span className="h-3.5 w-5 rounded border border-dashed border-success" aria-hidden="true" />
        Logged, unplanned
      </li>
      <li className="flex items-center gap-1.5">
        <Repeat className="size-3.5" aria-hidden="true" />
        Repeating
      </li>
    </ul>
  );
}

function Palette({ templates, onPick }: { templates: { id: string; name: string; kind: string }[] | undefined; onPick: (id: string) => void }) {
  const id = useId();
  return (
    <aside aria-labelledby={id} className="hidden xl:block">
      <div className="sticky top-4 rounded-[1.25rem] border border-line bg-surface p-4">
        <h2 id={id} className="text-[0.8125rem]">
          Templates
        </h2>
        <p className="mt-1 text-[0.6875rem] leading-relaxed text-muted">Drag one onto a day, or select it to pick a date.</p>
        {templates?.length === 0 && (
          <Link to="?tab=templates" className="mt-3 block text-[0.8125rem] font-medium underline underline-offset-4">
            Create a template
          </Link>
        )}
        <ul className="mt-3 max-h-[60vh] space-y-1.5 overflow-y-auto">
          {templates?.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData(TEMPLATE_MIME, t.id);
                  e.dataTransfer.effectAllowed = "copy";
                }}
                onClick={() => onPick(t.id)}
                className={cx(
                  "flex min-h-10 w-full cursor-grab items-center gap-2 rounded-xl border px-2.5 text-left text-[0.75rem] transition-colors active:cursor-grabbing",
                  t.kind === "RestDay" ? "border-dashed border-line text-muted hover:text-ink" : "border-line bg-surface-2/50 hover:border-field-line",
                )}
              >
                <GripVertical className="size-3.5 shrink-0 text-muted" aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate">{t.name}</span>
                {t.kind === "RestDay" && <Moon className="size-3.5 shrink-0" aria-hidden="true" />}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}

export function ToneIcon({ tone, className }: { tone: Tone; className?: string }) {
  const Icon = toneIcon[tone];
  return <Icon className={cx("size-3.5 shrink-0", toneIconClass[tone], className)} strokeWidth={tone === "done" ? 3 : 2} aria-hidden="true" />;
}

function EntryChip({ e, now, compact, onOpen }: { e: PlanEntry; now: string; compact?: boolean; onOpen: () => void }) {
  const tone = entryTone(e, now);
  const name = e.templateName ?? "Deleted template";
  const movable = e.status !== "Completed" && !!e.templateId;
  return (
    <button
      type="button"
      onClick={onOpen}
      draggable={movable}
      onDragStart={(ev) => {
        ev.dataTransfer.setData(ENTRY_MIME, e.id);
        ev.dataTransfer.effectAllowed = "move";
      }}
      aria-label={`${name}, ${toneLabel[tone]}${e.seriesId ? ", repeating" : ""}`}
      className={cx(
        "flex w-full items-center gap-1.5 rounded-lg border text-left transition-colors hover:brightness-110",
        toneClass[tone],
        movable && "cursor-grab active:cursor-grabbing",
        compact ? "min-h-6 px-1.5 text-[0.6875rem]" : "min-h-11 px-3 text-[0.8125rem]",
      )}
    >
      <ToneIcon tone={tone} />
      <span className={cx("min-w-0 flex-1 truncate", tone === "skipped" && "line-through decoration-muted/60")}>{name}</span>
      {e.seriesId && <Repeat className="size-3 shrink-0 text-muted" aria-hidden="true" />}
      {!compact && <span className="shrink-0 text-[0.6875rem] text-muted">{toneLabel[tone]}</span>}
    </button>
  );
}

function ExtraChip({ w, compact }: { w: WorkoutSummary; compact?: boolean }) {
  return (
    <Link
      to={`/workouts/${w.id}`}
      aria-label={`${w.name}, logged without a plan`}
      className={cx(
        "flex w-full items-center gap-1.5 rounded-lg border border-dashed border-success/45 text-left transition-colors hover:border-success/80",
        compact ? "min-h-6 px-1.5 text-[0.6875rem]" : "min-h-11 px-3 text-[0.8125rem]",
      )}
    >
      <Check className="size-3.5 shrink-0 text-success" aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate">{w.name}</span>
      {!compact && <span className="shrink-0 text-[0.6875rem] text-muted">Logged</span>}
    </Link>
  );
}

type DropProps = { onDragOver: (e: DragEvent) => void; onDragLeave: (e: DragEvent) => void; onDrop: (e: DragEvent) => Promise<void> };

function MonthGrid({
  anchor,
  title,
  now,
  itemsOn,
  over,
  dropProps,
  onDay,
  onEntry,
}: {
  anchor: Date;
  title: string;
  now: string;
  itemsOn: (iso: string) => DayItems;
  over: string | null;
  dropProps: (iso: string) => DropProps;
  onDay: (iso: string) => void;
  onEntry: (e: PlanEntry) => void;
}) {
  const MAX = 3;
  return (
    <table className="w-full table-fixed border-separate border-spacing-0.5 sm:border-spacing-1">
      <caption className="sr-only">{title}. Select a day to plan it or see what’s on it.</caption>
      <thead>
        <tr>
          {weekdayHeads.map((w) => (
            <th key={w.long} scope="col" abbr={w.long} className="pb-1 text-center text-[0.625rem] font-normal tracking-[0.06em] text-muted uppercase sm:text-[0.6875rem]">
              <span className="sm:hidden">{w.short.slice(0, 2)}</span>
              <span className="max-sm:hidden">{w.short}</span>
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {monthWeeks(anchor).map((week) => (
          <tr key={toIsoDate(week[0]!)}>
            {week.map((d) => {
              const iso = toIsoDate(d);
              const items = itemsOn(iso);
              const inMonth = isSameMonth(d, anchor);
              const isToday = iso === now;
              const all = items.entries.length + items.extra.length;
              const shownEntries = items.entries.slice(0, MAX);
              const shownExtra = items.extra.slice(0, Math.max(0, MAX - shownEntries.length));
              return (
                <td
                  key={iso}
                  {...dropProps(iso)}
                  className={cx(
                    "relative h-14 rounded-lg border p-0 align-top transition-shadow sm:h-16 md:h-28 md:rounded-xl",
                    inMonth ? "border-line bg-surface" : "border-line/40 bg-transparent",
                    isToday && "border-field-line",
                    over === iso && "ring-2 ring-accent",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => onDay(iso)}
                    aria-label={`${fullFmt.format(d)}${isToday ? ", today" : ""}: ${describe(items, now)}`}
                    aria-current={isToday ? "date" : undefined}
                    className="absolute inset-0 rounded-[inherit] transition-colors hover:bg-surface-2/60 focus-visible:-outline-offset-2"
                  />
                  <span
                    aria-hidden="true"
                    className={cx(
                      "pointer-events-none relative block px-1.5 pt-1 text-[0.6875rem] num",
                      isToday ? "text-accent-fg" : inMonth ? "text-muted" : "text-muted/45",
                    )}
                  >
                    {isToday ? <span className="rounded-full bg-accent px-1.5 py-px text-accent-ink">{d.getDate()}</span> : d.getDate()}
                  </span>
                  {all > 0 && (
                    <div className="pointer-events-none relative flex flex-wrap gap-0.5 px-1 pt-0.5 md:hidden" aria-hidden="true">
                      {items.entries.map((e) => (
                        <ToneIcon key={e.id} tone={entryTone(e, now)} className="size-3" />
                      ))}
                      {items.extra.map((w) => (
                        <span key={w.id} className="grid size-3 place-items-center rounded-sm border border-dashed border-success">
                          <Check className="size-2 text-success" strokeWidth={3} />
                        </span>
                      ))}
                    </div>
                  )}
                  {all > 0 && (
                    <ul className="pointer-events-none relative mt-1 hidden space-y-0.5 px-1 md:block">
                      {shownEntries.map((e) => (
                        <li key={e.id} className="pointer-events-auto">
                          <EntryChip e={e} now={now} compact onOpen={() => onEntry(e)} />
                        </li>
                      ))}
                      {shownExtra.map((w) => (
                        <li key={w.id} className="pointer-events-auto">
                          <ExtraChip w={w} compact />
                        </li>
                      ))}
                      {all > MAX && <li className="px-1 text-[0.625rem] text-muted">+{all - MAX} more</li>}
                    </ul>
                  )}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function DayRow({
  d,
  now,
  items,
  over,
  dropProps,
  onAdd,
  onEntry,
}: {
  d: Date;
  now: string;
  items: DayItems;
  over: boolean;
  dropProps: DropProps;
  onAdd: () => void;
  onEntry: (e: PlanEntry) => void;
}) {
  const iso = toIsoDate(d);
  const isToday = iso === now;
  const past = iso < now;
  const nothing = items.entries.length === 0 && items.extra.length === 0;
  return (
    <li
      {...dropProps}
      aria-current={isToday ? "date" : undefined}
      className={cx(
        "flex items-start gap-3 rounded-2xl border bg-surface p-2 pl-2.5 transition-shadow",
        isToday ? "border-field-line bg-surface-2/60" : "border-line",
        over && "ring-2 ring-accent",
      )}
    >
      <h3 className="w-10 shrink-0 pt-1.5 text-center">
        <span className="sr-only">
          {fullFmt.format(d)}
          {isToday && ", today"}
        </span>
        <span aria-hidden="true" className={cx("block text-[0.6875rem] tracking-[0.06em] uppercase", isToday ? "font-semibold text-ink" : "text-muted")}>
          {wdFmt.format(d)}
        </span>
        <span aria-hidden="true" className={cx("stat block text-lg leading-tight", past && !isToday ? "text-muted" : "text-ink")}>
          {d.getDate()}
        </span>
      </h3>
      <div className="min-w-0 flex-1 space-y-1.5">
        {nothing ? (
          <p className="flex min-h-11 items-center gap-1.5 text-[0.8125rem] text-muted">
            <span className="h-3.5 w-5 rounded border border-dashed border-line" aria-hidden="true" />
            {past ? "Nothing logged" : "Nothing planned"}
          </p>
        ) : (
          <>
            {items.entries.map((e) => (
              <EntryChip key={e.id} e={e} now={now} onOpen={() => onEntry(e)} />
            ))}
            {items.extra.map((w) => (
              <ExtraChip key={w.id} w={w} />
            ))}
          </>
        )}
      </div>
      <button
        type="button"
        onClick={onAdd}
        aria-label={`Plan ${fullFmt.format(d)}`}
        className="grid size-11 shrink-0 place-items-center rounded-xl border border-field-line text-muted transition-colors hover:bg-surface-2 hover:text-ink"
      >
        <Plus className="size-4" aria-hidden="true" />
      </button>
    </li>
  );
}

// ---------- Entry sheet ----------

const linkPrimary = buttonClass("primary");
const linkSecondary = buttonClass("secondary");

const dangerLink = "inline-flex min-h-11 items-center justify-center rounded-xl px-4 text-[0.8125rem] text-danger transition-colors hover:bg-danger/10";

const editSchema = z.object({
  date: z.string().min(1, "Pick a date."),
  templateId: z.string().min(1, "Pick a template."),
  note: z.string().max(500, "Keep the note under 500 characters."),
});
type EditForm = z.infer<typeof editSchema>;

export function EntrySheet({ entry, onClose }: { entry: PlanEntry; onClose: () => void }) {
  const now = today();
  const tone = entryTone(entry, now);
  const session = useStartSession();
  const templates = useQuery(templatesQuery);
  const [confirm, setConfirm] = useState<"one" | "series" | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const completed = entry.status === "Completed";
  const canStart = entry.status === "Planned" && entry.kind !== "RestDay" && entry.date <= now && !!entry.templateId;

  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<EditForm>({
    resolver: zodResolver(editSchema),
    defaultValues: { date: entry.date, templateId: entry.templateId ?? "", note: entry.note ?? "" },
  });

  const put = (patch: Partial<PlanEntryUpdate>) =>
    api.put<PlanEntry>(`/api/plan/${entry.id}`, {
      date: entry.date,
      templateId: entry.templateId ?? "",
      note: entry.note,
      status: entry.status === "Skipped" ? "Skipped" : "Planned",
      ...patch,
    } satisfies PlanEntryUpdate);

  const run = async (key: string, fn: () => Promise<unknown>, done: string) => {
    setBusy(key);
    try {
      await fn();
      toast.success(done);
      setConfirm(null);
      onClose();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const onSave = handleSubmit(async (v) => {
    try {
      await put({ date: v.date, templateId: v.templateId, note: v.note.trim() || null });
      toast.success(v.date !== entry.date ? `Moved to ${fmtWeekday(v.date)}` : "Saved");
      onClose();
    } catch (e) {
      if (!applyFieldErrors(e, setError)) toast.error(errorMessage(e));
    }
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2 text-[0.75rem] text-muted">
        <span>{fmtWeekday(entry.date)}</span>
        <span className={cx("inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5", toneClass[tone])}>
          <ToneIcon tone={tone} />
          {toneLabel[tone]}
        </span>
        {entry.seriesId && (
          <span className="inline-flex items-center gap-1 rounded-full border border-line px-2 py-0.5">
            <Repeat className="size-3" aria-hidden="true" />
            Part of a repeating plan
          </span>
        )}
      </div>

      {completed ? (
        <>
          {entry.note && <p className="text-[0.8125rem] leading-relaxed">{entry.note}</p>}
          <p className="text-[0.75rem] leading-relaxed text-muted">Completed days are part of your history, so they can’t be moved or deleted here.</p>
          {entry.workoutId && (
            <Link to={`/workouts/${entry.workoutId}`} className={cx(linkPrimary, "w-full")}>
              View Workout
            </Link>
          )}
        </>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2">
            {canStart && (
              <>
                <Button onClick={() => session.start({ planEntryId: entry.id })} loading={session.pending === entry.id}>
                  {session.pending !== entry.id && <Play className="size-4" aria-hidden="true" />}
                  Start Now
                </Button>
                <Link to={`/workouts/log?plan=${entry.id}&template=${entry.templateId}`} className={linkSecondary}>
                  Log Manually
                </Link>
              </>
            )}
            <Button
              variant="secondary"
              className="col-span-2"
              loading={busy === "skip"}
              onClick={() =>
                run(
                  "skip",
                  () => put({ status: entry.status === "Skipped" ? "Planned" : "Skipped" }),
                  entry.status === "Skipped" ? "Back on the plan" : "Skipped. Your history is untouched.",
                )
              }
            >
              {entry.status === "Skipped" ? "Unskip" : "Skip This Day"}
            </Button>
          </div>

          <form onSubmit={onSave} noValidate className="space-y-4 border-t border-line pt-4">
            <h3 className="text-[0.8125rem]">Change</h3>
            <DateField control={control} name="date" label="Date" error={errors.date?.message} required />
            <Field label="Template" error={errors.templateId?.message}>
              <Select {...register("templateId")}>
                <option value="" disabled>
                  Choose a template
                </option>
                {templates.data?.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                    {t.kind === "RestDay" ? " (rest day)" : ""}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Note (optional)" error={errors.note?.message}>
              <Textarea autoComplete="off" rows={2} className="min-h-14" {...register("note")} />
            </Field>
            <Button type="submit" variant="secondary" className="w-full" loading={isSubmitting} disabled={!isDirty}>
              Save Changes
            </Button>
          </form>

          <div className="flex flex-col gap-2 border-t border-line pt-4 sm:flex-row">
            <button type="button" className={dangerLink} onClick={() => setConfirm("one")}>
              Delete This Day
            </button>
            {entry.seriesId && (
              <button type="button" className={dangerLink} onClick={() => setConfirm("series")}>
                Delete This and Following
              </button>
            )}
          </div>
        </>
      )}

      <ConfirmDialog
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        loading={busy === "delete"}
        title={confirm === "series" ? "Delete Rest of Series?" : "Delete This Day?"}
        body={
          confirm === "series"
            ? `Removes every planned or skipped day in this series from ${fmtWeekday(entry.date)} on. Completed days and logged workouts stay.`
            : `Removes ${entry.templateName ?? "this entry"} from ${fmtWeekday(entry.date)}. Logged workouts are never affected.`
        }
        confirmLabel="Delete"
        onConfirm={() =>
          confirm === "series"
            ? run("delete", () => api.del(`/api/plan/series/${entry.seriesId}?from=${entry.date}`), "Series removed from this day on")
            : run("delete", () => api.del(`/api/plan/${entry.id}`), "Removed from your plan")
        }
      />
    </div>
  );
}

