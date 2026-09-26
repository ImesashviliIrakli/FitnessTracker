import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { toast } from "sonner";
import { addDays, differenceInCalendarDays, parseISO } from "date-fns";
import { AlertTriangle } from "lucide-react";
import { api, ApiError, applyFieldErrors, errorMessage } from "../lib/api";
import { useUnits } from "../lib/auth";
import { fmtDate, fmtNum, fmtShortDate, numOrNull, toIsoDate, today } from "../lib/format";
import type { Goal, WeightEntry, WeightInput } from "../lib/types";
import { Button, Field, Input, Select } from "./ui";
import { DateField } from "./DatePicker";

const num = { setValueAs: numOrNull };

/** Server field names → this form's field names. */
const serverFields: Record<string, string> = { targetWeightKg: "targetWeight", weeklyRateKg: "weeklyRate", weightKg: "currentWeight" };

/** "Apr 9", or "Apr 9, 2027" when it's not this year. */
const fmtWhen = (iso: string) => (iso.slice(0, 4) === today().slice(0, 4) ? fmtShortDate(iso) : fmtDate(iso));

/**
 * When the target date comes before the date the weekly rate would reach the target, the pace needed instead.
 * All values in kg; returns null when there's nothing to warn about.
 */
export function paceCheck(currentKg: number, targetKg: number, rateKg: number, targetDate: string, from = today()) {
  const remaining = Math.abs(currentKg - targetKg);
  if (remaining === 0 || rateKg <= 0) return null;
  const reached = toIsoDate(addDays(parseISO(from), Math.ceil((remaining / rateKg) * 7)));
  if (reached <= targetDate) return null;
  const weeks = differenceInCalendarDays(parseISO(targetDate), parseISO(from)) / 7;
  return { reached, requiredKg: weeks > 0 ? remaining / weeks : null };
}

/** Goal settings; with `withWeight` it also records a starting weigh-in (used by onboarding). */
export function GoalForm({
  goal,
  withWeight,
  submitLabel,
  onSaved,
}: {
  goal: Goal;
  withWeight?: boolean;
  submitLabel: string;
  onSaved?: () => void;
}) {
  const u = useUnits();
  const maxRate = u.toWeight(1.5);
  const weights = useQuery({ queryKey: ["weights"], queryFn: () => api.get<WeightEntry[]>("/api/weights") });
  const latestKg = weights.data?.length ? [...weights.data].sort((a, b) => a.date.localeCompare(b.date)).at(-1)!.weightKg : null;
  const kg = (x: number | null | undefined) => (x === null || x === undefined || Number.isNaN(x) ? null : u.fromWeight(x));
  const w = (k: number) => `${fmtNum(u.toWeight(k), 1)} ${u.weight}`;

  const schema = z
    .object({
      currentWeight: z.number().nullable(),
      mode: z.enum(["Lose", "Maintain", "Gain"]),
      targetWeight: z.number().nullable(),
      targetDate: z.string(),
      weeklyRate: z
        .number({ error: "Enter a weekly rate." })
        .min(0, "The weekly rate can’t be negative.")
        .max(maxRate, `Keep it at or under ${maxRate} ${u.weight} a week.`),
      weeklyWorkoutTarget: z
        .number({ error: "Enter how many workouts a week, 0–7." })
        .int("Use a whole number of workouts.")
        .min(0, "Pick between 0 and 7 workouts a week.")
        .max(7, "Pick between 0 and 7 workouts a week."),
    })
    .superRefine((v, ctx) => {
      const entered = kg(v.currentWeight);
      if (withWeight && (entered === null || entered < 20 || entered > 400))
        ctx.addIssue({ code: "custom", path: ["currentWeight"], message: `Enter your weight in ${u.weight}.` });
      if (v.mode === "Maintain") return;
      const t = kg(v.targetWeight);
      if (t === null || t < 20 || t > 400) {
        ctx.addIssue({ code: "custom", path: ["targetWeight"], message: `Enter a target weight in ${u.weight}.` });
      } else {
        const current = withWeight ? entered : latestKg;
        if (current !== null && v.mode === "Lose" && t >= current)
          ctx.addIssue({ code: "custom", path: ["targetWeight"], message: `To lose weight, the target must be below your current ${w(current)}.` });
        if (current !== null && v.mode === "Gain" && t <= current)
          ctx.addIssue({ code: "custom", path: ["targetWeight"], message: `To gain weight, the target must be above your current ${w(current)}.` });
      }
      if (v.weeklyRate === 0) ctx.addIssue({ code: "custom", path: ["weeklyRate"], message: "Enter a weekly rate above 0." });
      if (v.targetDate && v.targetDate <= today())
        ctx.addIssue({ code: "custom", path: ["targetDate"], message: "Pick a date in the future, or leave it empty." });
    });
  type Form = z.infer<typeof schema>;

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
      currentWeight: null,
      mode: goal.mode,
      targetWeight: goal.targetWeightKg === null ? null : u.toWeight(goal.targetWeightKg),
      targetDate: goal.targetDate ?? "",
      weeklyRate: u.toWeight(goal.weeklyRateKg),
      weeklyWorkoutTarget: goal.weeklyWorkoutTarget,
    },
  });
  const [mode, targetWeight, weeklyRate, targetDate, currentWeight] = watch(["mode", "targetWeight", "weeklyRate", "targetDate", "currentWeight"]);
  const maintain = mode === "Maintain";

  // A warning, not an error: the goal can still be saved with a date the current pace misses.
  const current = withWeight ? kg(currentWeight) : latestKg;
  const target = kg(targetWeight);
  const rate = kg(weeklyRate);
  const directionOk = current !== null && target !== null && (mode === "Lose" ? target < current : target > current);
  const pace =
    !maintain && directionOk && rate && targetDate && targetDate > today() ? paceCheck(current!, target!, rate, targetDate) : null;

  const onSubmit = handleSubmit(async (v) => {
    try {
      if (withWeight && v.currentWeight !== null) {
        const wi: WeightInput = { date: today(), weightKg: u.fromWeight(v.currentWeight), bodyFatPercent: null, note: null };
        await api.post("/api/weights", wi).catch((e) => {
          // A weigh-in for today already exists — that's fine for onboarding.
          if (!(e?.status === 409)) throw e;
        });
      }
      const body: Goal = {
        mode: v.mode,
        targetWeightKg: v.mode === "Maintain" || v.targetWeight === null ? null : u.fromWeight(v.targetWeight),
        targetDate: v.mode === "Maintain" || !v.targetDate ? null : v.targetDate,
        weeklyRateKg: v.mode === "Maintain" ? 0 : u.fromWeight(v.weeklyRate),
        weeklyWorkoutTarget: v.weeklyWorkoutTarget,
      };
      await api.put<Goal>("/api/goals", body);
      toast.success("Goal saved");
      onSaved?.();
    } catch (e) {
      if (e instanceof ApiError) e.fieldErrors = Object.fromEntries(Object.entries(e.fieldErrors).map(([k, m]) => [serverFields[k] ?? k, m]));
      if (!applyFieldErrors(e, setError)) toast.error(errorMessage(e));
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4 sm:grid-cols-2">
      {withWeight && (
        <Field label={`Current weight (${u.weight})`} error={errors.currentWeight?.message} className="sm:col-span-2">
          <Input type="number" inputMode="decimal" step="0.1" autoComplete="off" {...register("currentWeight", num)} />
        </Field>
      )}
      <Field label="Goal" error={errors.mode?.message}>
        <Select {...register("mode")}>
          <option value="Lose">Lose weight</option>
          <option value="Maintain">Maintain weight</option>
          <option value="Gain">Gain weight</option>
        </Select>
      </Field>
      <Field label="Workouts per week" error={errors.weeklyWorkoutTarget?.message} hint="0–7. Counts toward your weekly streak.">
        <Input type="number" inputMode="numeric" min={0} max={7} autoComplete="off" {...register("weeklyWorkoutTarget", num)} />
      </Field>
      {!maintain && (
        <>
          <Field
            label={`Target weight (${u.weight})`}
            error={errors.targetWeight?.message}
            hint={!withWeight && latestKg !== null ? `Your latest weigh-in: ${w(latestKg)}.` : undefined}
          >
            <Input type="number" inputMode="decimal" step="0.1" autoComplete="off" {...register("targetWeight", num)} />
          </Field>
          <Field
            label={`Weekly rate (${u.weight}/week)`}
            error={errors.weeklyRate?.message}
            hint={u.system === "Metric" ? "0.25–0.75 kg a week is sustainable for most people." : "0.5–1.5 lb a week is sustainable for most people."}
          >
            <Input type="number" inputMode="decimal" step="0.05" min={0} max={maxRate} autoComplete="off" {...register("weeklyRate", num)} />
          </Field>
          <DateField control={control} name="targetDate" label="Target date (optional)" error={errors.targetDate?.message} min={today()} placeholder="No target date" />
          {pace && (
            <p role="status" className="flex items-start gap-2 rounded-xl border border-warning/50 bg-warning/10 p-3 text-[0.8125rem] leading-relaxed sm:col-span-2">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
              <span>
                At {fmtNum(u.toWeight(rate!), 2)} {u.weight}/week you’d reach {w(target!)} around {fmtWhen(pace.reached)}, after your target date (
                {fmtWhen(targetDate)}).
                {pace.requiredKg !== null && ` You’d need about ${fmtNum(u.toWeight(pace.requiredKg), 1)} ${u.weight}/week.`}
              </span>
            </p>
          )}
        </>
      )}
      <div className="sm:col-span-2">
        <Button type="submit" loading={isSubmitting}>
          {isSubmitting ? "Saving…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}
