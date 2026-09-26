import { useEffect, useRef } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { api, applyFieldErrors } from "../lib/api";
import { useUnits } from "../lib/auth";
import { fmtNum, numOrNull } from "../lib/format";
import { activityLabels, type ActivityLevel, type CalorieInput, type CalorieResult, type Dashboard, type Goal, type Profile } from "../lib/types";
import type { Units } from "../lib/units";
import { CalorieResultView } from "../components/CalorieResultView";
import { ChoiceGrid } from "../components/ChoiceGrid";
import { Button, Card, ErrorState, Field, Input, Loading, PageHeader, Select } from "../components/ui";

const activity = Object.keys(activityLabels) as ActivityLevel[];

// "Moderate — exercise 3–5 days a week" is too long for a closed select on a phone in the wide face:
// the option shows the level, the hint below spells out what the chosen level means.
const activityName = (a: ActivityLevel) => activityLabels[a].split(" — ")[0];
const activityDesc = (a: ActivityLevel | undefined) => {
  const d = a ? activityLabels[a].split(" — ")[1] : undefined;
  return d ? d.charAt(0).toUpperCase() + d.slice(1) + "." : undefined;
};

export default function CalculatorPage() {
  const u = useUnits();
  const profile = useQuery({ queryKey: ["profile"], queryFn: () => api.get<Profile>("/api/profile") });
  const goal = useQuery({ queryKey: ["goals"], queryFn: () => api.get<Goal>("/api/goals") });
  const dash = useQuery({ queryKey: ["dashboard"], queryFn: () => api.get<Dashboard>("/api/dashboard") });
  const error = profile.error ?? goal.error ?? dash.error;

  return (
    <>
      <PageHeader
        title="Calorie Target"
        description="Estimates how much to eat each day for your goal, from your body stats and activity. It doesn’t track what you eat."
      />
      {profile.isPending || goal.isPending || dash.isPending ? (
        <Loading />
      ) : error ? (
        <ErrorState error={error} onRetry={() => (profile.refetch(), goal.refetch(), dash.refetch())} />
      ) : (
        <Calculator u={u} profile={profile.data!} goal={goal.data!} dash={dash.data!} />
      )}
    </>
  );
}

function Calculator({ u, profile, goal, dash }: { u: Units; profile: Profile; goal: Goal; dash: Dashboard }) {
  const maxRate = u.toWeight(1.5);
  const avgKcal = dash.training.avgExerciseKcalPerDay ?? 0;
  const range = (lo: number, hi: number, unit: string, msg: string) =>
    z.number({ error: msg }).min(lo, `Between ${lo} and ${hi} ${unit}.`).max(hi, `Between ${lo} and ${hi} ${unit}.`);
  const schema = z
    .object({
      sex: z.enum(["Male", "Female"], { error: "Choose one." }),
      age: z.number({ error: "Enter your age." }).int().min(14, "Ages 14–100.").max(100, "Ages 14–100."),
      height: range(Math.round(u.toLength(100)), Math.round(u.toLength(250)), u.length, "Enter your height."),
      weight: range(Math.round(u.toWeight(20)), Math.round(u.toWeight(400)), u.weight, "Enter your weight."),
      bodyFatPercent: z.number().min(2, "Between 2 and 70%.").max(70, "Between 2 and 70%.").nullable(),
      activityLevel: z.enum(activity as [ActivityLevel, ...ActivityLevel[]]),
      mode: z.enum(["Lose", "Maintain", "Gain"]),
      weeklyRate: z.number({ error: "Enter a weekly rate." }).min(0).max(maxRate, `At most ${maxRate} ${u.weight} a week.`),
      targetWeight: z.number().nullable(),
      source: z.enum(["activity", "logged"]),
      exerciseKcal: z.number().min(0, "Between 0 and 3000 kcal.").max(3000, "Between 0 and 3000 kcal.").nullable(),
    })
    .refine((v) => v.source === "activity" || v.exerciseKcal !== null, { message: "Enter your daily training calories.", path: ["exerciseKcal"] });
  type Form = z.infer<typeof schema>;
  const num = { setValueAs: numOrNull };

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    setError,
    formState: { errors },
  } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: {
      sex: profile.sex ?? undefined,
      age: profile.age ?? (undefined as unknown as number),
      height: profile.heightCm ? u.toLength(profile.heightCm) : (undefined as unknown as number),
      weight: dash.weight.latestKg ? u.toWeight(dash.weight.latestKg) : (undefined as unknown as number),
      bodyFatPercent: dash.weight.bodyFatPercent,
      activityLevel: profile.activityLevel,
      mode: goal.mode,
      weeklyRate: u.toWeight(goal.weeklyRateKg),
      targetWeight: goal.targetWeightKg === null ? null : u.toWeight(goal.targetWeightKg),
      source: profile.useLoggedActivity ? "logged" : "activity",
      exerciseKcal: Math.round(avgKcal),
    },
  });
  const maintain = watch("mode") === "Maintain";
  const source = watch("source");

  const calc = useMutation({
    mutationFn: (v: Form) => {
      const body: CalorieInput = {
        sex: v.sex,
        age: v.age,
        heightCm: u.fromLength(v.height),
        weightKg: u.fromWeight(v.weight),
        bodyFatPercent: v.bodyFatPercent,
        activityLevel: v.activityLevel,
        mode: v.mode,
        weeklyRateKg: v.mode === "Maintain" ? 0 : u.fromWeight(v.weeklyRate),
        targetWeightKg: v.mode === "Maintain" || v.targetWeight === null ? null : u.fromWeight(v.targetWeight),
        exerciseKcalPerDay: v.source === "logged" ? v.exerciseKcal : null,
      };
      return api.post<CalorieResult>("/api/calculator", body);
    },
    onError: (e) => applyFieldErrors(e, setError),
  });
  const onSubmit = handleSubmit((v) => calc.mutate(v));

  // Profile already complete? Show a result straight away.
  const ran = useRef(false);
  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    if (profile.sex && profile.age && profile.heightCm && dash.weight.latestKg) void onSubmit();
  }, [onSubmit, profile, dash]);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <Card aria-label="Your details">
        <form onSubmit={onSubmit} noValidate className="grid gap-4 sm:grid-cols-2">
          <Field label="Sex" error={errors.sex?.message}>
            <Select defaultValue="" {...register("sex")}>
              <option value="" disabled>Choose…</option>
              <option value="Female">Female</option>
              <option value="Male">Male</option>
            </Select>
          </Field>
          <Field label="Age" error={errors.age?.message}>
            <Input type="number" inputMode="numeric" autoComplete="off" {...register("age", num)} />
          </Field>
          <Field label={`Height (${u.length})`} error={errors.height?.message}>
            <Input type="number" inputMode="decimal" step="0.1" autoComplete="off" {...register("height", num)} />
          </Field>
          <Field label={`Weight (${u.weight})`} error={errors.weight?.message}>
            <Input type="number" inputMode="decimal" step="0.1" autoComplete="off" {...register("weight", num)} />
          </Field>
          <Field label="Body fat % (optional)" error={errors.bodyFatPercent?.message} hint="If set, uses Katch-McArdle, which is more accurate for lean or muscular people." className="sm:col-span-2">
            <Input type="number" inputMode="decimal" step="0.1" autoComplete="off" {...register("bodyFatPercent", num)} />
          </Field>
          <ChoiceGrid
            label="Activity from"
            value={source}
            onChange={(v) => setValue("source", v)}
            options={[
              { value: "activity", label: "Activity level" },
              { value: "logged", label: "Logged workouts" },
            ]}
            className="sm:col-span-2"
          />
          {source === "activity" ? (
            <Field label="Activity level" error={errors.activityLevel?.message} hint={activityDesc(watch("activityLevel"))} className="sm:col-span-2">
              <Select {...register("activityLevel")}>
                {activity.map((a) => (
                  <option key={a} value={a}>{activityName(a)}</option>
                ))}
              </Select>
            </Field>
          ) : (
            <Field
              label="Training calories (kcal / day)"
              error={errors.exerciseKcal?.message}
              hint={`Your logged workouts average ${fmtNum(avgKcal)} kcal a day over the last 28 days. Maintenance = resting × 1.2 + this. Adjust it if your log misses sessions.`}
              className="sm:col-span-2"
            >
              <Input type="number" inputMode="numeric" step="1" autoComplete="off" {...register("exerciseKcal", num)} />
            </Field>
          )}
          <Field label="Goal" error={errors.mode?.message}>
            <Select {...register("mode")}>
              <option value="Lose">Lose weight</option>
              <option value="Maintain">Maintain weight</option>
              <option value="Gain">Gain weight</option>
            </Select>
          </Field>
          {!maintain && (
            <>
              <Field label={`Weekly rate (${u.weight})`} error={errors.weeklyRate?.message}>
                <Input type="number" inputMode="decimal" step="0.05" autoComplete="off" {...register("weeklyRate", num)} />
              </Field>
              <Field label={`Target weight (${u.weight}, optional)`} error={errors.targetWeight?.message} hint="Adds a projected goal date.">
                <Input type="number" inputMode="decimal" step="0.1" autoComplete="off" {...register("targetWeight", num)} />
              </Field>
            </>
          )}
          <div className="sm:col-span-2">
            <Button type="submit" loading={calc.isPending}>
              {calc.isPending ? "Calculating…" : "Calculate"}
            </Button>
          </div>
        </form>
      </Card>

      <div aria-live="polite">
        {calc.isError && !Object.keys((calc.error as { fieldErrors?: object }).fieldErrors ?? {}).length ? (
          <ErrorState error={calc.error} />
        ) : calc.data ? (
          <Card aria-label="Result">
            <CalorieResultView result={calc.data} u={u} />
          </Card>
        ) : (
          <div className="rounded-xl border border-dashed border-line p-6 text-muted">
            Fill in your details and select <strong className="text-ink">Calculate</strong> to see your daily target, maintenance calories and a suggested protein, fat and carb split.
          </div>
        )}
      </div>
    </div>
  );
}
