import { useMemo } from "react";
import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { parseISO } from "date-fns";
import { z } from "zod";
import { toast } from "sonner";
import { Check } from "lucide-react";
import { api, applyFieldErrors, errorMessage } from "../../lib/api";
import { fmtShortDate, fmtWeekday, numOrNull, today } from "../../lib/format";
import type { DayOfWeek, PlanEntry, PlanEntryInput, RecurringPlanInput } from "../../lib/types";
import { DateField } from "../../components/DatePicker";
import { Button, cx, Dialog, Field, Input, Segmented, Select, Textarea } from "../../components/ui";
import { dayOfWeek, recurringDates, weekdayOrder, type DayItems } from "./calendar";
import { entryTone, renameFieldErrors, templatesQuery, toneIcon, toneIconClass, toneLabel } from "./shared";

export type ScheduleTarget = { date?: string; templateId?: string; repeat?: boolean };

/** Quick-add: put a template on a date once, or repeat it on chosen weekdays. Keyboard alternative to drag-and-drop. */
export function ScheduleSheet({
  target,
  onClose,
  dayItems,
  onOpenEntry,
}: {
  target: ScheduleTarget | null;
  onClose: () => void;
  /** What's already on the tapped day (calendar only). */
  dayItems?: DayItems;
  onOpenEntry?: (e: PlanEntry) => void;
}) {
  const title = target?.date && !target.templateId ? fmtWeekday(target.date) : "Schedule";
  return (
    <Dialog open={target !== null} onClose={onClose} title={title}>
      {target && (
        <>
          {dayItems && (dayItems.entries.length > 0 || dayItems.extra.length > 0) && <OnThisDay items={dayItems} onOpenEntry={onOpenEntry} />}
          <ScheduleForm target={target} onDone={onClose} />
        </>
      )}
    </Dialog>
  );
}

function OnThisDay({ items, onOpenEntry }: { items: DayItems; onOpenEntry?: (e: PlanEntry) => void }) {
  const now = today();
  return (
    <section aria-label="On this day" className="mb-5">
      <h3 className="mb-2 text-[0.6875rem] tracking-[0.08em] text-muted uppercase">On this day</h3>
      <ul className="space-y-1.5">
        {items.entries.map((e) => {
          const tone = entryTone(e, now);
          const Icon = toneIcon[tone];
          return (
            <li key={e.id}>
              <button
                type="button"
                onClick={() => onOpenEntry?.(e)}
                className="flex min-h-11 w-full items-center gap-2.5 rounded-xl border border-line bg-surface-2/50 px-3 text-left text-[0.8125rem] hover:border-muted/40"
              >
                <Icon className={cx("size-3.5 shrink-0", toneIconClass[tone])} aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate">{e.templateName ?? "Deleted template"}</span>
                <span className="text-[0.6875rem] text-muted">{toneLabel[tone]}</span>
              </button>
            </li>
          );
        })}
        {items.extra.map((w) => (
          <li key={w.id}>
            <Link
              to={`/workouts/${w.id}`}
              className="flex min-h-11 items-center gap-2.5 rounded-xl border border-dashed border-success/40 px-3 text-[0.8125rem] hover:border-success/70"
            >
              <Check className="size-3.5 shrink-0 text-success" aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate">{w.name}</span>
              <span className="text-[0.6875rem] text-muted">Logged, unplanned</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

const schema = z
  .object({
    mode: z.enum(["once", "repeat"]),
    templateId: z.string().min(1, "Pick a template."),
    date: z.string().min(1, "Pick a date."),
    note: z.string().max(500, "Keep the note under 500 characters."),
    weekdays: z.array(z.custom<DayOfWeek>()),
    weeks: z.number().nullable(),
  })
  .superRefine((v, ctx) => {
    if (v.mode !== "repeat") return;
    if (v.weekdays.length === 0) ctx.addIssue({ code: "custom", path: ["weekdays"], message: "Pick at least one day." });
    if (v.weeks === null || !Number.isInteger(v.weeks) || v.weeks < 1 || v.weeks > 26) ctx.addIssue({ code: "custom", path: ["weeks"], message: "Repeat for 1–26 weeks." });
  });
type Form = z.infer<typeof schema>;

const shortDay = (d: string) => d.slice(0, 2);

export function ScheduleForm({ target, onDone }: { target: ScheduleTarget; onDone: () => void }) {
  const templates = useQuery(templatesQuery);
  const date = target.date ?? today();
  const {
    register,
    control,
    handleSubmit,
    watch,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: {
      mode: target.repeat ? "repeat" : "once",
      templateId: target.templateId ?? "",
      date,
      note: "",
      weekdays: [dayOfWeek(parseISO(date))],
      weeks: 4,
    },
  });
  const [mode, start, weekdays, weeks] = watch(["mode", "date", "weekdays", "weeks"]);
  const preview = useMemo(() => (mode === "repeat" ? recurringDates(start, weekdays, weeks ?? 0) : []), [mode, start, weekdays, weeks]);

  const onSubmit = handleSubmit(async (v) => {
    const name = templates.data?.find((t) => t.id === v.templateId)?.name ?? "Workout";
    const note = v.note.trim() || null;
    try {
      if (v.mode === "once") {
        await api.post<PlanEntry>("/api/plan", { templateId: v.templateId, date: v.date, note } satisfies PlanEntryInput);
        toast.success(`${name} planned for ${fmtWeekday(v.date)}`);
      } else {
        const body: RecurringPlanInput = {
          templateId: v.templateId,
          startDate: v.date,
          weekdays: weekdayOrder.filter((d) => v.weekdays.includes(d)),
          weeks: v.weeks!,
          note,
        };
        const created = await api.post<PlanEntry[]>("/api/plan/recurring", body);
        toast.success(`${name} planned ${created.length} times`);
      }
      onDone();
    } catch (e) {
      renameFieldErrors(e, (k) => (k === "startDate" ? "date" : k));
      if (!applyFieldErrors(e, setError)) toast.error(errorMessage(e));
    }
  });

  if (templates.data?.length === 0)
    return (
      <p className="text-[0.8125rem] leading-relaxed text-muted">
        You have no templates yet.{" "}
        <Link to="/workouts/plan?tab=templates" onClick={onDone} className="font-medium text-ink underline underline-offset-4">
          Create one
        </Link>{" "}
        first, then put it on your calendar.
      </p>
    );

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      <Controller
        control={control}
        name="mode"
        render={({ field }) => (
          <Segmented
            label="How often"
            value={field.value}
            onChange={field.onChange}
            options={[
              { value: "once", label: "Once" },
              { value: "repeat", label: "Repeat weekly" },
            ]}
          />
        )}
      />
      <Field label="Template" error={errors.templateId?.message}>
        <Select disabled={templates.isPending} {...register("templateId")}>
          <option value="" disabled>
            {templates.isPending ? "Loading…" : "Choose a template"}
          </option>
          {templates.data?.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
              {t.kind === "RestDay" ? " (rest day)" : ""}
            </option>
          ))}
        </Select>
      </Field>
      <DateField control={control} name="date" label={mode === "repeat" ? "Starting" : "Date"} error={errors.date?.message} required />
      {mode === "repeat" && (
        <>
          <fieldset aria-describedby={errors.weekdays ? "weekdays-err" : undefined}>
            <legend className="mb-1.5 text-[0.8125rem]">On these days</legend>
            <Controller
              control={control}
              name="weekdays"
              render={({ field }) => (
                <div className="grid grid-cols-7 gap-1">
                  {weekdayOrder.map((d) => {
                    const on = field.value.includes(d);
                    return (
                      <label
                        key={d}
                        className={cx(
                          "grid min-h-11 cursor-pointer place-items-center rounded-lg border text-[0.75rem] transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent-fg",
                          on ? "border-ink/70 bg-line font-semibold text-ink" : "border-line bg-surface-2/60 text-muted hover:text-ink",
                        )}
                      >
                        <input
                          type="checkbox"
                          className="sr-only"
                          aria-label={d}
                          checked={on}
                          onChange={() => field.onChange(on ? field.value.filter((x) => x !== d) : [...field.value, d])}
                        />
                        <span aria-hidden="true">{shortDay(d)}</span>
                      </label>
                    );
                  })}
                </div>
              )}
            />
            {errors.weekdays && (
              <p id="weekdays-err" className="mt-1.5 text-xs text-danger">
                {errors.weekdays.message}
              </p>
            )}
          </fieldset>
          <Field label="For how many weeks" error={errors.weeks?.message} hint="Up to 26 weeks.">
            <Input type="number" inputMode="numeric" min={1} max={26} autoComplete="off" {...register("weeks", { setValueAs: numOrNull })} />
          </Field>
          <p className="rounded-xl bg-surface-2/60 px-3 py-2.5 text-[0.75rem] leading-relaxed text-muted" aria-live="polite">
            {preview.length === 0
              ? "Pick days to see what gets added."
              : `Adds ${preview.length} ${preview.length === 1 ? "day" : "days"}: ${fmtShortDate(preview[0]!)} to ${fmtShortDate(preview[preview.length - 1]!)}.`}
          </p>
        </>
      )}
      <Field label="Note (optional)" error={errors.note?.message}>
        <Textarea autoComplete="off" rows={2} className="min-h-14" placeholder="Focus on depth…" {...register("note")} />
      </Field>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" loading={isSubmitting}>
          {isSubmitting ? "Saving…" : mode === "repeat" ? "Add to Calendar" : "Plan It"}
        </Button>
      </div>
    </form>
  );
}
