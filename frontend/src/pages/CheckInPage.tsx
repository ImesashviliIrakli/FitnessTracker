import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useForm, type UseFormRegister } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { HeartPulse } from "lucide-react";
import { api, ApiError, applyFieldErrors, errorMessage } from "../lib/api";
import { fmtNum, fmtWeekday, numOrNull, today } from "../lib/format";
import type { DailyInput, DailyLog } from "../lib/types";
import { Button, Card, ConfirmDialog, cx, EmptyState, ErrorState, Field, Input, Loading, PageHeader, Textarea } from "../components/ui";
import { DatePicker } from "../components/DatePicker";

// Radio groups yield strings (or null when none is checked); converted on submit.
const rating = z.string().nullable();
const schema = z.object({
  steps: z.number().int("Whole steps only.").min(0).max(100000, "Up to 100,000 steps.").nullable(),
  sleepHours: z.number().min(0).max(24, "0–24 hours.").nullable(),
  restingHeartRate: z.number().int().min(25, "25–220 bpm.").max(220, "25–220 bpm.").nullable(),
  energy: rating,
  soreness: rating,
  mood: rating,
  note: z.string().max(500),
});
type Form = z.infer<typeof schema>;
type RatingKey = "energy" | "soreness" | "mood";

/** `highIsBad`: soreness 5 means very sore, while energy and mood 5 are good. Stored values keep that meaning. */
const scales: Record<RatingKey, { label: string; low: string; high: string; highIsBad?: boolean }> = {
  energy: { label: "Energy", low: "Drained", high: "Energised" },
  soreness: { label: "Soreness", low: "None", high: "Very sore", highIsBad: true },
  mood: { label: "Mood", low: "Low", high: "Great" },
};
export const emptyCheckInMessage = "Fill in at least one value.";

export default function CheckInPage() {
  const [date, setDate] = useState(today());
  const q = useQuery({ queryKey: ["daily"], queryFn: () => api.get<DailyLog[]>("/api/daily") });
  const entry = q.data?.find((d) => d.date === date) ?? null;

  return (
    <>
      <PageHeader title="Daily Check-in" description="Recovery and activity: steps, sleep, resting heart rate and how you feel. Takes 20 seconds." />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Card aria-label="Check-in form">
          <div className="mb-5 sm:max-w-72">
            <Field label="Day">
              <DatePicker max={today()} value={date} onChange={(v) => v && setDate(v)} required />
            </Field>
          </div>
          {q.isPending ? <Loading /> : <CheckInForm key={`${date}-${entry ? "e" : "n"}`} date={date} entry={entry} />}
        </Card>
        <History q={q} onPick={setDate} selected={date} />
      </div>
    </>
  );
}

function CheckInForm({ date, entry }: { date: string; entry: DailyLog | null }) {
  const [confirm, setConfirm] = useState(false);
  const num = { setValueAs: numOrNull };
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: {
      steps: entry?.steps ?? null,
      sleepHours: entry?.sleepHours ?? null,
      restingHeartRate: entry?.restingHeartRate ?? null,
      energy: entry?.energy?.toString() ?? null,
      soreness: entry?.soreness?.toString() ?? null,
      mood: entry?.mood?.toString() ?? null,
      note: entry?.note ?? "",
    },
  });
  const del = useMutation({
    mutationFn: () => api.del(`/api/daily/${date}`),
    onSuccess: () => {
      toast.success("Check-in deleted");
      setConfirm(false);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const onSubmit = handleSubmit(async (v) => {
    const values = [v.steps, v.sleepHours, v.restingHeartRate, v.energy, v.soreness, v.mood];
    if (values.every((x) => x === null || x === "") && !v.note.trim()) return setError("root", { message: emptyCheckInMessage });
    const body: DailyInput = {
      ...v,
      energy: numOrNull(v.energy),
      soreness: numOrNull(v.soreness),
      mood: numOrNull(v.mood),
      note: v.note.trim() || null,
    };
    try {
      await api.put(`/api/daily/${date}`, body);
      toast.success("Check-in saved");
    } catch (e) {
      if (applyFieldErrors(e, setError)) return;
      if (e instanceof ApiError && e.status === 400) setError("root", { message: e.message });
      else toast.error(errorMessage(e));
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6">
      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        onConfirm={() => del.mutate()}
        loading={del.isPending}
        title="Delete Check-in?"
        body={`Your check-in for ${fmtWeekday(date)} will be removed.`}
        confirmLabel="Delete Check-in"
      />
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Steps" error={errors.steps?.message}>
          <Input type="number" inputMode="numeric" autoComplete="off" placeholder="8000…" {...register("steps", num)} />
        </Field>
        <Field label="Sleep (hours)" error={errors.sleepHours?.message}>
          <Input type="number" inputMode="decimal" step="0.25" autoComplete="off" placeholder="7.5…" {...register("sleepHours", num)} />
        </Field>
        <Field label="Resting heart rate (bpm)" error={errors.restingHeartRate?.message}>
          <Input type="number" inputMode="numeric" autoComplete="off" placeholder="58…" {...register("restingHeartRate", num)} />
        </Field>
      </div>
      {(Object.keys(scales) as RatingKey[]).map((k) => (
        <Rating key={k} name={k} register={register} />
      ))}
      <Field label="Note (optional)" error={errors.note?.message}>
        <Textarea autoComplete="off" placeholder="Slept badly, legs heavy from Tuesday…" {...register("note")} />
      </Field>
      {errors.root?.message && (
        <p role="alert" className="text-[0.8125rem] text-danger">
          {errors.root.message}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" loading={isSubmitting}>
          {isSubmitting ? "Saving…" : "Save Check-in"}
        </Button>
        {entry && (
          <Button variant="ghost" className="text-danger" onClick={() => setConfirm(true)}>
            Delete
          </Button>
        )}
      </div>
    </form>
  );
}

function Rating({ name, register }: { name: RatingKey; register: UseFormRegister<Form> }) {
  const s = scales[name];
  const [lowTone, highTone] = s.highIsBad ? ["text-success", "text-warning"] : ["text-warning", "text-success"];
  return (
    <fieldset>
      <legend className="text-[0.8125rem]">
        {s.label} <span className="text-muted">(1 = {s.low.toLowerCase()}, 5 = {s.high.toLowerCase()})</span>
      </legend>
      <div className="mt-2 max-w-sm">
        <div className="grid grid-cols-5 gap-1.5">
          {[1, 2, 3, 4, 5].map((v) => (
            <label key={v} className="relative">
              <input type="radio" value={v} className="peer sr-only" {...register(name)} />
              <span
                className={cx(
                  "stat grid h-11 cursor-pointer place-items-center rounded-xl border border-line text-base font-semibold text-muted transition-colors",
                  "peer-checked:border-ink/70 peer-checked:bg-surface-2 peer-checked:text-ink peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent-fg",
                  "hover:border-ink/40",
                )}
              >
                {v}
                <span className="sr-only">{v === 1 ? ` (${s.low})` : v === 5 ? ` (${s.high})` : ""}</span>
              </span>
            </label>
          ))}
        </div>
        <div
          className="mt-1.5 h-1 rounded-full opacity-70"
          style={{ background: `linear-gradient(to right, var(${s.highIsBad ? "--success" : "--warning"}), var(--line) 50%, var(${s.highIsBad ? "--warning" : "--success"}))` }}
          aria-hidden="true"
        />
        <div className="mt-1 flex justify-between text-[0.6875rem]" aria-hidden="true">
          <span className={lowTone}>{s.low}</span>
          <span className={highTone}>{s.high}</span>
        </div>
      </div>
    </fieldset>
  );
}

function History({ q, onPick, selected }: { q: ReturnType<typeof useQuery<DailyLog[]>>; onPick: (d: string) => void; selected: string }) {
  if (q.isPending) return <Loading />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const rows = [...q.data].reverse();
  return (
    <section aria-labelledby="hist-h">
      <h2 id="hist-h" className="mb-2 text-[0.9375rem] font-semibold">
        Last 30 days
      </h2>
      {rows.length === 0 ? (
        <EmptyState icon={<HeartPulse className="size-6" />} title="No check-ins yet">
          Consistent check-ins show how sleep and soreness line up with your training.
        </EmptyState>
      ) : (
        <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
          {rows.map((d) => (
            <li key={d.date}>
              <button
                type="button"
                onClick={() => onPick(d.date)}
                aria-current={d.date === selected ? "date" : undefined}
                className={cx("min-h-11 w-full px-4 py-2.5 text-left hover:bg-surface-2", d.date === selected && "bg-surface-2 shadow-[inset_3px_0_0_var(--accent)]")}
              >
                <span className="block text-[0.8125rem]">{fmtWeekday(d.date)}</span>
                <span className="num mt-0.5 block text-[0.6875rem] leading-snug text-muted">
                  {[
                    d.steps !== null && `${fmtNum(d.steps)} steps`,
                    d.sleepHours !== null && `${fmtNum(d.sleepHours, 2)} h sleep`,
                    d.restingHeartRate !== null && `${d.restingHeartRate} bpm`,
                  ]
                    .filter(Boolean)
                    .join(", ") || "Ratings only"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
