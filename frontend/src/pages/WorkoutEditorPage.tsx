import { Fragment, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useBlocker, useNavigate, useParams, useSearchParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { useFieldArray, useForm, useWatch, type Control, type UseFormRegister, type FieldErrors } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, CalendarCheck, Copy, Plus, Trash2, X } from "lucide-react";
import { api, ApiError, applyFieldErrors, errorMessage } from "../lib/api";
import { useUnits } from "../lib/auth";
import { fmtDate, fmtNum, numOrNull, today } from "../lib/format";
import { categoryColor, estimate1Rm, setVolume, supersetLetter } from "../lib/training";
import type { Exercise, PersonalRecord, PlanEntry, Template, Workout, WorkoutInput, WorkoutSummary } from "../lib/types";
import type { Units } from "../lib/units";
import { ExercisePicker, exercisesQuery } from "../components/ExercisePicker";
import { Button, Card, ConfirmDialog, cx, EmptyState, ErrorState, Field, Input, Loading, NotFoundState, PageHeader, Select, Textarea } from "../components/ui";
import { DateField } from "../components/DatePicker";
import { ChoiceGrid } from "../components/ChoiceGrid";

// Phone switch for the set table: RIR/Rest/Tempo move to their own row per set (can't be done in CSS alone).
const phoneMq = "(max-width: 639px)";
const subscribePhone = (cb: () => void) => {
  const m = window.matchMedia(phoneMq);
  m.addEventListener("change", cb);
  return () => m.removeEventListener("change", cb);
};
const usePhone = () => useSyncExternalStore(subscribePhone, () => window.matchMedia(phoneMq).matches);

// ---- Form model (display units) ----
const n = z.number().nullable();
const setSchema = z.object({
  reps: z.number().int("Whole reps only.").min(0).max(1000).nullable(),
  weight: z.number().min(0, "Can’t be negative.").max(2000).nullable(),
  rpe: z.number().min(1, "RPE is 1–10.").max(10, "RPE is 1–10.").nullable(),
  rir: z.number().int().min(0, "RIR is 0–10.").max(10, "RIR is 0–10.").nullable(),
  restSeconds: z.number().int().min(0).max(3600).nullable(),
  tempo: z.string().max(20),
  durationMin: z.number().min(0).max(1440).nullable(),
  distance: n,
  avgHeartRate: z.number().int().min(25, "25–250 bpm.").max(250, "25–250 bpm.").nullable(),
  isWarmup: z.boolean(),
});
const typeChoices = ["auto", "Strength", "Cardio", "Mobility", "Other"] as const;
const schema = z
  .object({
    date: z.string().min(1, "Pick a date."),
    startTime: z.string().regex(/^(\d{2}:\d{2})?$/, "Use a time like 07:30."),
    type: z.enum(typeChoices),
    name: z.string().trim().min(1, "Name the workout.").max(100),
    durationMinutes: z.number().int("Whole minutes.").min(1, "1–1440 minutes.").max(1440, "1–1440 minutes.").nullable(),
    notes: z.string().max(2000),
    exercises: z.array(
      z.object({ exerciseId: z.string(), supersetGroup: z.number().nullable(), notes: z.string().max(500), sets: z.array(setSchema) }),
    ),
  })
  .refine((v) => v.exercises.length > 0 || v.durationMinutes !== null, {
    message: "Add an exercise, or enter a duration for the session.",
    path: ["durationMinutes"],
  });
type Form = z.infer<typeof schema>;
type SetForm = Form["exercises"][number]["sets"][number];
/** Template/plan links sent with the workout; not user-editable fields. */
type Link = { templateId: string | null; planEntryId: string | null };

const emptySet = (): SetForm => ({
  reps: null,
  weight: null,
  rpe: null,
  rir: null,
  restSeconds: null,
  tempo: "",
  durationMin: null,
  distance: null,
  avgHeartRate: null,
  isWarmup: false,
});

function fromWorkout(w: Workout, u: Units, date = w.date): Form {
  return {
    date,
    startTime: w.startTime?.slice(0, 5) ?? "",
    type: w.type ?? "auto",
    name: w.name,
    durationMinutes: w.durationMinutes,
    notes: w.notes ?? "",
    exercises: w.exercises.map((e) => ({
      exerciseId: e.exerciseId,
      supersetGroup: e.supersetGroup,
      notes: e.notes ?? "",
      sets: e.sets.map((s) => ({
        reps: s.reps,
        weight: s.weightKg === null ? null : u.toWeight(s.weightKg),
        rpe: s.rpe,
        rir: s.rir,
        restSeconds: s.restSeconds,
        tempo: s.tempo ?? "",
        durationMin: s.durationSeconds === null ? null : Math.round((s.durationSeconds / 60) * 10) / 10,
        distance: s.distanceM === null ? null : u.toDistance(s.distanceM),
        avgHeartRate: s.avgHeartRate,
        isWarmup: s.isWarmup,
      })),
    })),
  };
}

/** Template items → exercises with `sets` rows. A %1RM target uses the best e1RM from records, rounded to 2.5 kg (same rule as sessions). */
function templateExercises(t: Template, u: Units, records: PersonalRecord[] = []): Form["exercises"] {
  const best = new Map(records.map((r) => [r.exerciseId, r.best1Rm]));
  return t.exercises.map((e) => {
    const oneRm = best.get(e.exerciseId);
    const kg = e.targetWeightKg ?? (e.targetPercent1Rm && oneRm ? Math.round(((e.targetPercent1Rm / 100) * oneRm) / 2.5) * 2.5 : null);
    const set: SetForm = { ...emptySet(), reps: e.reps, weight: kg === null ? null : u.toWeight(kg), rpe: e.rpe, rir: e.rir, restSeconds: e.restSeconds, tempo: e.tempo ?? "" };
    return { exerciseId: e.exerciseId, supersetGroup: e.group, notes: e.notes ?? "", sets: Array.from({ length: e.sets }, () => ({ ...set })) };
  });
}

function toInput(v: Form, u: Units, link: Link): WorkoutInput {
  return {
    date: v.date,
    startTime: v.startTime || null,
    type: v.type === "auto" ? null : v.type,
    ...link,
    name: v.name.trim(),
    durationMinutes: v.durationMinutes,
    notes: v.notes.trim() || null,
    exercises: v.exercises.map((e) => ({
      exerciseId: e.exerciseId,
      supersetGroup: e.supersetGroup,
      notes: e.notes.trim() || null,
      sets: e.sets.map((s) => ({
        reps: s.reps,
        weightKg: s.weight === null ? null : u.fromWeight(s.weight),
        rpe: s.rpe,
        rir: s.rir,
        restSeconds: s.restSeconds,
        tempo: s.tempo.trim() || null,
        durationSeconds: s.durationMin === null ? null : Math.round(s.durationMin * 60),
        distanceM: s.distance === null ? null : u.fromDistance(s.distance),
        avgHeartRate: s.avgHeartRate,
        isWarmup: s.isWarmup,
      })),
    })),
  };
}

const blank = (): Form => ({ date: today(), startTime: "", type: "auto", name: "", durationMinutes: null, notes: "", exercises: [] });

const templatesQuery = { queryKey: ["templates"], queryFn: () => api.get<Template[]>("/api/templates") };
const recordsQuery = { queryKey: ["records"], queryFn: () => api.get<PersonalRecord[]>("/api/records") };

async function findPlanEntry(id: string) {
  try {
    return await api.get<PlanEntry>(`/api/plan/${encodeURIComponent(id)}`);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  }
}

// ---- Page ----
export default function WorkoutEditorPage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const u = useUnits();
  const exercises = useQuery(exercisesQuery);
  const existing = useQuery({ queryKey: ["workout", id], queryFn: () => api.get<Workout>(`/api/workouts/${id}`), enabled: !!id });
  const repeatId = id ? null : params.get("repeat");
  const planId = id ? null : params.get("plan");
  const plan = useQuery({ queryKey: ["plan", "entry", planId], queryFn: () => findPlanEntry(planId!), enabled: !!planId });
  const templateId = id ? null : (params.get("template") ?? plan.data?.templateId ?? null);
  const repeat = useQuery({ queryKey: ["workout", repeatId], queryFn: () => api.get<Workout>(`/api/workouts/${repeatId}`), enabled: !!repeatId });
  const templates = useQuery({ ...templatesQuery, enabled: !!templateId });
  const records = useQuery({ ...recordsQuery, enabled: !!templateId });

  const pending =
    exercises.isPending ||
    (id && existing.isPending) ||
    (repeatId && repeat.isPending) ||
    (planId && plan.isPending) ||
    (templateId && (templates.isPending || records.isPending)); // records failing just leaves %1RM weights empty
  const error = exercises.error ?? existing.error ?? repeat.error ?? plan.error ?? templates.error;

  let initial: Form | null = null;
  const link: Link = { templateId: null, planEntryId: null };
  const entry = plan.data ?? null;
  if (!pending && !error) {
    if (id && existing.data) {
      initial = fromWorkout(existing.data, u);
      link.templateId = existing.data.templateId;
      link.planEntryId = existing.data.planEntryId;
    } else if (repeat.data) initial = { ...fromWorkout(repeat.data, u, today()), startTime: "", type: "auto" };
    else {
      initial = blank();
      const t = templates.data?.find((x) => x.id === templateId);
      if (t) {
        initial = { ...initial, name: t.name, exercises: templateExercises(t, u, records.data) };
        link.templateId = t.id;
      }
      if (entry) {
        // A plan for a later day, logged now, counts as done today.
        initial.date = entry.date < today() ? entry.date : today();
        if (!t && entry.templateName) initial.name = entry.templateName;
        link.planEntryId = entry.id;
      }
    }
  }

  return (
    <>
      <PageHeader title={id ? "Edit workout" : "Add workout"} description={id ? undefined : "Log a session you did without starting it live."} />
      {entry && !id && (
        <p className="mb-4 flex items-center gap-2 rounded-xl border border-line bg-surface-2/70 px-3 py-2.5 text-[0.8125rem] leading-snug">
          <CalendarCheck className="size-4 shrink-0" aria-hidden="true" />
          <span>
            Completes: {entry.templateName ?? "Planned workout"} on {fmtDate(entry.date)}
          </span>
        </p>
      )}
      {pending ? (
        <Loading />
      ) : error ? (
        error instanceof ApiError && error.status === 404 ? (
          <NotFoundState title="Workout not found" message="It may have been deleted, or the link is wrong." backTo="/workouts" backLabel="Back to Workouts" />
        ) : (
          <ErrorState error={error} />
        )
      ) : (
        <Editor key={`${id}-${repeatId}-${templateId}-${planId}`} id={id} initial={initial!} link={link} library={exercises.data!} u={u} />
      )}
    </>
  );
}

function Editor({ id, initial, link: initialLink, library, u }: { id?: string; initial: Form; link: Link; library: Exercise[]; u: Units }) {
  const navigate = useNavigate();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const byId = useMemo(() => new Map(library.map((e) => [e.id, e])), [library]);
  const [link, setLink] = useState(initialLink);

  const form = useForm<Form>({ resolver: zodResolver(schema), defaultValues: initial });
  const {
    register,
    control,
    handleSubmit,
    reset,
    setError,
    getValues,
    setValue,
    formState: { errors, isSubmitting, isDirty },
  } = form;
  const ex = useFieldArray({ control, name: "exercises" });
  const records = useQuery(recordsQuery);
  const type = useWatch({ control, name: "type" });

  const pullTemplate = (t: Template) => {
    ex.append(templateExercises(t, u, records.data), { shouldFocus: false });
    if (!getValues("name").trim()) setValue("name", t.name, { shouldDirty: true });
    setLink((l) => (l.templateId ? l : { ...l, templateId: t.id }));
    toast.success(`Added ${t.exercises.length} ${t.exercises.length === 1 ? "exercise" : "exercises"} from ${t.name}`);
  };

  // Guard unsaved work (in-app navigation and tab close). A ref, because we navigate right after saving.
  const leaving = useRef(false);
  const blocker = useBlocker(({ currentLocation, nextLocation }) => isDirty && !leaving.current && currentLocation.pathname !== nextLocation.pathname);
  useEffect(() => {
    if (!isDirty) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [isDirty]);

  const onSubmit = handleSubmit(async (v) => {
    try {
      const body = toInput(v, u, link);
      if (id) {
        await api.put<Workout>(`/api/workouts/${id}`, body);
        reset(v); // stay on the page, now clean
        toast.success("Workout updated");
        return;
      }
      const saved = await api.post<Workout>("/api/workouts", body);
      leaving.current = true;
      toast.success("Workout saved");
      navigate(`/workouts/${saved.id}`, { replace: true });
    } catch (e) {
      if (!applyFieldErrors(e, setError)) toast.error(errorMessage(e));
    }
  });

  const remove = async () => {
    setDeleting(true);
    try {
      await api.del(`/api/workouts/${id}`);
      leaving.current = true;
      toast.success("Workout deleted");
      navigate("/workouts", { replace: true });
    } catch (e) {
      toast.error(errorMessage(e));
      setDeleting(false);
    }
  };

  const values = useWatch({ control });
  const totals = useMemo(() => {
    let volume = 0;
    let sets = 0;
    for (const e of values.exercises ?? [])
      for (const s of e.sets ?? []) {
        sets++;
        volume += setVolume({ weight: s.weight ?? null, reps: s.reps ?? null, isWarmup: !!s.isWarmup });
      }
    return { volume, sets };
  }, [values]);

  return (
    <>
      <ExercisePicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPick={(e) => ex.append({ exerciseId: e.id, supersetGroup: null, notes: "", sets: [emptySet()] })}
      />
      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={remove}
        loading={deleting}
        title="Delete Workout?"
        body="This workout and all its sets will be removed. Records and streaks are recalculated."
        confirmLabel="Delete Workout"
      />
      <ConfirmDialog
        open={blocker.state === "blocked"}
        onClose={() => blocker.reset?.()}
        onConfirm={() => blocker.proceed?.()}
        title="Discard Changes?"
        body="You have unsaved changes to this workout."
        confirmLabel="Discard Changes"
      />

      <StartFrom showRepeat={!id && initial.exercises.length === 0} onPullTemplate={pullTemplate} />

      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <Card>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-[minmax(0,1fr)_14.5rem_9rem_9rem]">
            <Field label="Name" error={errors.name?.message} className="col-span-2 lg:col-span-1">
              <Input autoComplete="off" placeholder="Upper body, 5 km run…" {...register("name")} />
            </Field>
            <div className="col-span-2 min-w-0 lg:col-span-1">
              <DateField control={control} name="date" label="Date" error={errors.date?.message} max={today()} required />
            </div>
            <Field label="Start time" error={errors.startTime?.message}>
              <Input type="time" autoComplete="off" {...register("startTime")} />
            </Field>
            <Field label="Duration (min)" error={errors.durationMinutes?.message}>
              <Input type="number" inputMode="numeric" min={1} autoComplete="off" {...register("durationMinutes", { setValueAs: numOrNull })} />
            </Field>
            <ChoiceGrid
              label="Workout type"
              hint="Auto picks the type from your exercises."
              value={type}
              onChange={(v) => setValue("type", v, { shouldDirty: true })}
              options={typeChoices.map((v) => ({ value: v, label: v === "auto" ? "Auto" : v }))}
              className="col-span-2 lg:col-span-4"
              grid="grid-cols-3 sm:inline-grid sm:grid-cols-5"
            />
          </div>
        </Card>

        {ex.fields.length === 0 ? (
          <EmptyState title="No exercises yet" action={<Button variant="secondary" onClick={() => setPickerOpen(true)}>Add Exercise</Button>}>
            Add lifts, runs, mobility work or a sport. Sets and reps are optional for cardio and sport.
          </EmptyState>
        ) : (
          ex.fields.map((f, i) => (
            <ExerciseBlock
              key={f.id}
              index={i}
              count={ex.fields.length}
              exercise={byId.get(f.exerciseId)}
              control={control}
              register={register}
              errors={errors}
              u={u}
              onRemove={() => ex.remove(i)}
              onMove={(d) => ex.move(i, i + d)}
            />
          ))
        )}

        {ex.fields.length > 0 && (
          <Button variant="secondary" onClick={() => setPickerOpen(true)}>
            <Plus className="size-4" aria-hidden="true" />
            Add Exercise
          </Button>
        )}

        <Card>
          <Field label="Session notes (optional)" error={errors.notes?.message}>
            <Textarea autoComplete="off" placeholder="How it felt, what to change next time…" {...register("notes")} />
          </Field>
        </Card>

        <div className="sticky bottom-[calc(5.75rem+env(safe-area-inset-bottom))] z-30 flex items-center gap-2 rounded-2xl border border-line bg-surface/90 p-2 pl-3 shadow-2xl shadow-black/50 backdrop-blur-xl sm:gap-3 sm:p-3 md:bottom-4">
          <p className="stat mr-auto min-w-0 text-xs leading-tight text-muted sm:text-sm" aria-live="polite">
            <span className="font-semibold text-ink">{totals.sets}</span> sets
            <span className="max-sm:block">
              <span className="max-sm:hidden">, </span>
              <span className="font-semibold text-accent-fg">{fmtNum(totals.volume)}</span> {u.weight}
              <span className="max-sm:hidden"> volume</span>
            </span>
          </p>
          {id && (
            <Button variant="ghost" onClick={() => setConfirmDelete(true)} className="text-danger max-sm:px-3" aria-label="Delete workout">
              <Trash2 className="size-4" aria-hidden="true" />
              <span className="max-sm:hidden">Delete</span>
            </Button>
          )}
          <Button type="submit" loading={isSubmitting}>
            {isSubmitting ? "Saving…" : "Save Workout"}
          </Button>
        </div>
      </form>
    </>
  );
}

/** Starting points: repeat a recent session (new, empty log only) or append a template's exercises. */
function StartFrom({ showRepeat, onPullTemplate }: { showRepeat: boolean; onPullTemplate: (t: Template) => void }) {
  const navigate = useNavigate();
  const templates = useQuery(templatesQuery);
  const recent = useQuery({ queryKey: ["workouts"], queryFn: () => api.get<WorkoutSummary[]>("/api/workouts"), enabled: showRepeat });
  const t = (templates.data ?? []).filter((x) => x.kind !== "RestDay" && x.exercises.length > 0);
  const r = showRepeat ? (recent.data ?? []).slice(0, 10) : [];
  if (t.length === 0 && r.length === 0) return null;
  return (
    <Card className="mb-4" aria-label="Start from">
      <div className="grid gap-4 sm:grid-cols-2">
        {r.length > 0 && (
          <Field label="Repeat a recent workout">
            <Select defaultValue="" onChange={(e) => e.target.value && navigate(`/workouts/log?repeat=${e.target.value}`)}>
              <option value="" disabled>
                Choose a workout…
              </option>
              {r.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}, {fmtDate(w.date)}
                </option>
              ))}
            </Select>
          </Field>
        )}
        {t.length > 0 && (
          <Field label="Pull from template" hint="Adds its exercises and target sets below.">
            <Select
              value=""
              onChange={(e) => {
                const pick = t.find((x) => x.id === e.target.value);
                if (pick) onPullTemplate(pick);
              }}
            >
              <option value="" disabled>
                Choose a template…
              </option>
              {t.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
      </div>
    </Card>
  );
}

function ExerciseBlock({
  index,
  count,
  exercise,
  control,
  register,
  errors,
  u,
  onRemove,
  onMove,
}: {
  index: number;
  count: number;
  exercise?: Exercise;
  control: Control<Form>;
  register: UseFormRegister<Form>;
  errors: FieldErrors<Form>;
  u: Units;
  onRemove: () => void;
  onMove: (delta: number) => void;
}) {
  const sets = useFieldArray({ control, name: `exercises.${index}.sets` });
  const watched = useWatch({ control, name: `exercises.${index}.sets` });
  const [details, setDetails] = useState(false);
  const category = exercise?.category ?? "Strength";
  const strength = category === "Strength";
  const name = exercise?.name ?? "Unknown exercise";
  const setErrors = errors.exercises?.[index]?.sets;
  const num = { setValueAs: numOrNull };

  const phone = usePhone();
  const inlineDetails = details && !phone; // desktop: extra columns; phone: a second row under each set
  // `!` because the Input primitive's own h-12/px-3.5 would otherwise win.
  // Headers and values are centred in every column at every width, so a header always sits over its own inputs.
  const cell = "h-11! w-full min-w-0 px-1! text-center tabular-nums sm:h-9! sm:px-2! aria-[invalid=true]:focus:border-danger aria-[invalid=true]:outline-danger";
  const th = "px-0.5 pb-2 text-center text-[0.6875rem] font-medium sm:px-1 sm:text-xs";
  const td = "px-0.5 py-1 sm:p-1";
  const addSet = () => {
    const last = watched?.at(-1);
    sets.append(last ? { ...emptySet(), ...last, isWarmup: false } : emptySet());
  };

  return (
    <Card className="relative overflow-hidden pl-5 sm:pl-6" aria-label={name}>
      <span className="absolute inset-y-3 left-0 w-1 rounded-r-full" style={{ background: categoryColor[category], boxShadow: `0 0 12px ${categoryColor[category]}` }} aria-hidden="true" />
      <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
        <div className="min-w-0 flex-1 basis-40">
          <h2 className="line-clamp-2 text-lg leading-tight font-semibold">{name}</h2>
          <p className="mt-0.5 text-xs text-muted">
            {category}
            {exercise?.primaryMuscle && ` · ${exercise.primaryMuscle}`}
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm max-sm:order-last max-sm:basis-full">
          <span className="text-muted">Superset</span>
          <Select className="h-10! w-28 pr-8 pl-3! sm:h-9!" {...register(`exercises.${index}.supersetGroup`, { setValueAs: numOrNull })}>
            <option value="">None</option>
            {[1, 2, 3, 4, 5].map((g) => (
              <option key={g} value={g}>
                {supersetLetter(g)}
              </option>
            ))}
          </Select>
        </label>
        <div className="-mt-1 -mr-2 flex">
          <IconBtn label={`Move ${name} up`} disabled={index === 0} onClick={() => onMove(-1)}>
            <ArrowUp className="size-4" />
          </IconBtn>
          <IconBtn label={`Move ${name} down`} disabled={index === count - 1} onClick={() => onMove(1)}>
            <ArrowDown className="size-4" />
          </IconBtn>
          <IconBtn label={`Remove ${name}`} onClick={onRemove} danger>
            <X className="size-4" />
          </IconBtn>
        </div>
      </div>

      <div className="mt-4 -mx-1 overflow-x-auto">
        <table className="w-full table-fixed text-sm">
          <caption className="sr-only">Sets for {name}</caption>
          <thead className="text-muted">
            <tr>
              <th scope="col" className={cx(th, "w-9 px-0! sm:w-10")}>Set</th>
              {strength ? (
                <>
                  <th scope="col" className={th}>{u.weight}</th>
                  <th scope="col" className={th}>Reps</th>
                  <th scope="col" className={th}>RPE</th>
                  {inlineDetails && (
                    <>
                      <th scope="col" className={th}>RIR</th>
                      <th scope="col" className={th}>Rest (s)</th>
                      <th scope="col" className={cx(th, "w-28")}>Tempo</th>
                    </>
                  )}
                  <th scope="col" className={cx(th, "w-11 sm:w-16")}>e1RM</th>
                </>
              ) : (
                <>
                  <th scope="col" className={th}>Min</th>
                  {category === "Cardio" && <th scope="col" className={th}>{u.distance}</th>}
                  {category === "Mobility" && <th scope="col" className={th}>Reps</th>}
                  <th scope="col" className={th}>Avg HR</th>
                  {category === "Cardio" && <th scope="col" className={cx(th, "w-24 max-sm:hidden")}>Pace</th>}
                </>
              )}
              <th scope="col" className="w-11 pb-2"><span className="sr-only">Remove</span></th>
            </tr>
          </thead>
          <tbody>
            {sets.fields.map((s, j) => {
              const w = watched?.[j];
              const p = `exercises.${index}.sets.${j}` as const;
              const e = setErrors?.[j];
              const label = (col: string) => `${name} set ${j + 1} ${col}`;
              const e1 = strength && w ? estimate1Rm(w.weight ?? null, w.reps ?? null) : null;
              const pace =
                category === "Cardio" && w?.durationMin && w.distance ? u.formatPace((w.durationMin * 60) / (u.fromDistance(w.distance) / 1000)) : null;
              const detailInputs = [
                { col: "RIR", input: <Input aria-label={label("RIR")} aria-invalid={!!e?.rir} type="number" inputMode="numeric" autoComplete="off" className={cell} {...register(`${p}.rir`, num)} /> },
                { col: "Rest (s)", input: <Input aria-label={label("rest seconds")} aria-invalid={!!e?.restSeconds} type="number" inputMode="numeric" autoComplete="off" className={cell} {...register(`${p}.restSeconds`, num)} /> },
                { col: "Tempo", input: <Input aria-label={label("tempo")} placeholder="3-1-1-0" autoComplete="off" className={cx(cell, "max-sm:px-0! max-sm:text-[0.8125rem] max-sm:tracking-[-0.06em]")} {...register(`${p}.tempo`)} /> },
              ];
              return (
                <Fragment key={s.id}>
                  <tr className={cx("align-top", w?.isWarmup && "text-muted")}>
                    <td className="py-1">
                      <label className="relative mx-auto block w-8" title="Tap to mark as warm-up">
                        <input type="checkbox" aria-label={label("warm-up")} className="peer sr-only" {...register(`${p}.isWarmup`)} />
                        <span className="stat grid h-11 w-8 cursor-pointer place-items-center rounded-lg text-sm text-ink/80 peer-checked:bg-surface-2 peer-checked:text-muted peer-focus-visible:outline-2 peer-focus-visible:outline-accent-fg sm:h-9">
                          {w?.isWarmup ? "W" : j + 1}
                        </span>
                      </label>
                    </td>
                    {strength ? (
                      <>
                        <td className={td}><Input aria-label={label(u.weight)} aria-invalid={!!e?.weight} type="number" inputMode="decimal" step="0.5" autoComplete="off" className={cell} {...register(`${p}.weight`, num)} /></td>
                        <td className={td}><Input aria-label={label("reps")} aria-invalid={!!e?.reps} type="number" inputMode="numeric" autoComplete="off" className={cell} {...register(`${p}.reps`, num)} /></td>
                        <td className={td}><Input aria-label={label("RPE")} aria-invalid={!!e?.rpe} type="number" inputMode="decimal" step="0.5" min={1} max={10} autoComplete="off" className={cell} {...register(`${p}.rpe`, num)} /></td>
                        {inlineDetails && detailInputs.map((d) => <td key={d.col} className={td}>{d.input}</td>)}
                        <td className="stat py-1 text-center text-xs leading-[2.75rem] tracking-[-0.04em] text-muted sm:leading-9">{e1 !== null ? fmtNum(e1, 0) : "–"}</td>
                      </>
                    ) : (
                      <>
                        <td className={td}><Input aria-label={label("minutes")} aria-invalid={!!e?.durationMin} type="number" inputMode="decimal" step="0.1" autoComplete="off" className={cell} {...register(`${p}.durationMin`, num)} /></td>
                        {category === "Cardio" && (
                          <td className={td}><Input aria-label={label(u.distance)} aria-invalid={!!e?.distance} type="number" inputMode="decimal" step="0.01" autoComplete="off" className={cell} {...register(`${p}.distance`, num)} /></td>
                        )}
                        {category === "Mobility" && (
                          <td className={td}><Input aria-label={label("reps")} aria-invalid={!!e?.reps} type="number" inputMode="numeric" autoComplete="off" className={cell} {...register(`${p}.reps`, num)} /></td>
                        )}
                        <td className={td}><Input aria-label={label("average heart rate")} aria-invalid={!!e?.avgHeartRate} type="number" inputMode="numeric" autoComplete="off" className={cell} {...register(`${p}.avgHeartRate`, num)} /></td>
                        {category === "Cardio" && <td className="stat py-1 text-center text-xs leading-9 tracking-[-0.04em] text-muted max-sm:hidden">{pace ?? "–"}</td>}
                      </>
                    )}
                    <td className="py-1">
                      <IconBtn label={`Remove set ${j + 1}`} onClick={() => sets.remove(j)} danger>
                        <Trash2 className="size-4" />
                      </IconBtn>
                    </td>
                  </tr>
                  {strength && details && phone && (
                    <tr className={cx("border-b border-line/60 last:border-0", w?.isWarmup && "text-muted")}>
                      <td />
                      {/* RIR under kg, Rest under Reps, Tempo under RPE: each in its own column so they line up. */}
                      {detailInputs.map((d) => (
                        <td key={d.col} className={cx(td, "pt-0 pb-2")}>
                          <span className="mb-0.5 block text-center text-[0.625rem] text-muted" aria-hidden="true">{d.col}</span>
                          {d.input}
                        </td>
                      ))}
                      <td colSpan={2} />
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      {index === 0 && sets.fields.length > 0 && <p className="mt-1 text-[0.6875rem] text-muted">Tap a set number to mark it as a warm-up (W). Warm-ups don’t count toward volume or records.</p>}
      {setErrors && Array.isArray(setErrors) && setErrors.some(Boolean) && (
        <p className="mt-2 text-xs font-medium text-danger" role="alert">
          {Object.values((setErrors.find(Boolean) ?? {}) as Record<string, { message?: string } | undefined>).find((x) => x?.message)?.message}
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button size="sm" variant="secondary" onClick={addSet}>
          <Copy className="size-3.5" aria-hidden="true" />
          {sets.fields.length ? "Add Set (Copy Last)" : "Add Set"}
        </Button>
        {strength && (
          <Button size="sm" variant="ghost" onClick={() => setDetails((d) => !d)} aria-expanded={details}>
            {details ? "Hide RIR, Rest & Tempo" : "Show RIR, Rest & Tempo"}
          </Button>
        )}
      </div>
      <div className="mt-3">
        <label className="sr-only" htmlFor={`ex-notes-${index}`}>
          Notes for {name}
        </label>
        <Input id={`ex-notes-${index}`} autoComplete="off" placeholder="Notes for this exercise…" className="h-11 sm:h-9" {...register(`exercises.${index}.notes`)} />
      </div>
    </Card>
  );
}

function IconBtn({ label, onClick, disabled, danger, children }: { label: string; onClick: () => void; disabled?: boolean; danger?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={cx(
        "grid size-10 place-items-center rounded-lg text-muted disabled:opacity-30 sm:size-9",
        danger ? "hover:bg-danger/10 hover:text-danger" : "hover:bg-surface-2 hover:text-ink",
      )}
    >
      <span aria-hidden="true">{children}</span>
    </button>
  );
}
