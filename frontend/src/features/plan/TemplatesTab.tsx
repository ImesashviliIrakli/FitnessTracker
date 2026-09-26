import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Controller, useFieldArray, useForm, type UseFormRegister } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, CalendarPlus, ClipboardList, Copy, Moon, Pencil, Play, Plus, Trash2, X } from "lucide-react";
import { api, applyFieldErrors, errorMessage } from "../../lib/api";
import { useUnits } from "../../lib/auth";
import { fmtNum, numOrNull } from "../../lib/format";
import { categoryColor, supersetLetter } from "../../lib/training";
import type { ExerciseCategory, GroupType, Template, TemplateInput, TemplateKind } from "../../lib/types";
import type { Units } from "../../lib/units";
import { ExercisePicker } from "../../components/ExercisePicker";
import { Button, Card, ConfirmDialog, cx, Dialog, EmptyState, ErrorState, Field, Input, Segmented, Select, Skeleton, Textarea } from "../../components/ui";
import { ScheduleSheet, type ScheduleTarget } from "./ScheduleSheet";
import { renameFieldErrors, templatesQuery, useStartSession } from "./shared";

/** Group colours cycle through the chart tokens (A = chart-1 …). */
const groupColor = (g: number) => `var(--chart-${((g - 1) % 3) + 1})`;

export function TemplatesTab() {
  const u = useUnits();
  const q = useQuery(templatesQuery);
  const [editing, setEditing] = useState<{ t: Template | null } | null>(null);
  const [toDelete, setToDelete] = useState<Template | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [schedule, setSchedule] = useState<ScheduleTarget | null>(null);
  const session = useStartSession();

  const duplicate = async (t: Template) => {
    try {
      const copy = await api.post<Template>(`/api/templates/${t.id}/duplicate`);
      toast.success(`Created “${copy.name}”`);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };
  const remove = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await api.del(`/api/templates/${toDelete.id}`);
      toast.success("Template deleted");
      setToDelete(null);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-[0.8125rem] text-muted">
          {q.data ? `${q.data.length} ${q.data.length === 1 ? "template" : "templates"}` : " "}
        </p>
        {!(q.isSuccess && q.data.length === 0) && (
          <Button size="sm" onClick={() => setEditing({ t: null })}>
            <Plus className="size-4" aria-hidden="true" />
            New Template
          </Button>
        )}
      </div>

      {q.isPending ? (
        <div role="status" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <span className="sr-only">Loading templates…</span>
          <Skeleton className="h-52" />
          <Skeleton className="h-52" />
          <Skeleton className="h-52 max-sm:hidden" />
        </div>
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : q.data.length === 0 ? (
        <EmptyState icon={<ClipboardList className="size-6" />} title="No templates yet" action={<Button onClick={() => setEditing({ t: null })}>New Template</Button>}>
          Save the sessions you repeat, like “Push day” or a rest day, then drop them on your calendar.
        </EmptyState>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-label="Templates">
          {q.data.map((t) => (
            <li key={t.id} className="min-w-0">
              <TemplateCard
                t={t}
                u={u}
                starting={session.pending === t.id}
                onStart={() => session.start({ templateId: t.id })}
                onSchedule={() => setSchedule({ templateId: t.id })}
                onEdit={() => setEditing({ t })}
                onDuplicate={() => duplicate(t)}
                onDelete={() => setToDelete(t)}
              />
            </li>
          ))}
        </ul>
      )}

      <Dialog open={editing !== null} onClose={() => setEditing(null)} title={editing?.t ? "Edit Template" : "New Template"} wide>
        {editing && <TemplateEditor template={editing.t} onDone={() => setEditing(null)} />}
      </Dialog>
      <ScheduleSheet target={schedule} onClose={() => setSchedule(null)} />
      <ConfirmDialog
        open={toDelete !== null}
        onClose={() => setToDelete(null)}
        onConfirm={remove}
        loading={deleting}
        title="Delete Template?"
        body={`“${toDelete?.name}” will be removed, along with any days on your calendar that still plan it. Workouts you already logged from it stay in your history.`}
        confirmLabel="Delete Template"
      />
    </>
  );
}

function loadText(e: Template["exercises"][number], u: Units) {
  if (e.targetPercent1Rm !== null) return ` @ ${fmtNum(e.targetPercent1Rm)}%`;
  if (e.targetWeightKg !== null) return ` @ ${fmtNum(u.toWeight(e.targetWeightKg), 1)} ${u.weight}`;
  return "";
}

function IconButton({ label, onClick, danger, children }: { label: string; onClick: () => void; danger?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cx(
        "inline-grid size-11 place-items-center rounded-lg text-muted transition-colors sm:size-9",
        danger ? "hover:bg-danger/10 hover:text-danger" : "hover:bg-surface-2 hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}

function TemplateCard({
  t,
  u,
  starting,
  onStart,
  onSchedule,
  onEdit,
  onDuplicate,
  onDelete,
}: {
  t: Template;
  u: Units;
  starting: boolean;
  onStart: () => void;
  onSchedule: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const rest = t.kind === "RestDay";
  const shown = t.exercises.slice(0, 4);
  const sets = t.exercises.reduce((n, e) => n + e.sets, 0);
  return (
    <Card aria-label={t.name} className={cx("flex h-full flex-col p-4 sm:p-5", rest && "border-dashed bg-surface/60")}>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[0.9375rem] leading-snug">{t.name}</h2>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.6875rem] text-muted">
            {rest ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-line px-2 py-0.5">
                <Moon className="size-3" aria-hidden="true" />
                Rest day
              </span>
            ) : (
              <>
                <span className="rounded-full border border-line px-2 py-0.5">Workout</span>
                <span className="num">
                  {t.exercises.length} {t.exercises.length === 1 ? "exercise" : "exercises"}, {sets} sets
                </span>
              </>
            )}
          </p>
        </div>
        <div className="-mr-2 -mt-2 flex shrink-0 sm:-mr-1 sm:-mt-1">
          <IconButton label={`Edit ${t.name}`} onClick={onEdit}>
            <Pencil className="size-4" aria-hidden="true" />
          </IconButton>
          <IconButton label={`Duplicate ${t.name}`} onClick={onDuplicate}>
            <Copy className="size-4" aria-hidden="true" />
          </IconButton>
          <IconButton label={`Delete ${t.name}`} onClick={onDelete} danger>
            <Trash2 className="size-4" aria-hidden="true" />
          </IconButton>
        </div>
      </div>
      {t.description && <p className="mt-2 line-clamp-2 text-[0.75rem] leading-relaxed text-muted">{t.description}</p>}
      {rest ? (
        <p className="mt-3 flex-1 text-[0.75rem] leading-relaxed text-muted">Recovery on purpose. Plan it so a quiet day counts as on track.</p>
      ) : (
        <ol className="mt-3 flex-1 space-y-1 text-[0.75rem]">
          {shown.map((e, i) => (
            <li key={i} className="flex items-center gap-2">
              {e.group !== null ? (
                <span
                  className="grid size-4 shrink-0 place-items-center rounded text-[0.5625rem] text-bg"
                  style={{ background: groupColor(e.group) }}
                  title={`${e.groupType ?? "Superset"} ${supersetLetter(e.group)}`}
                >
                  {supersetLetter(e.group)}
                </span>
              ) : (
                <span className="h-3 w-1 shrink-0 rounded-full" style={{ background: categoryColor[e.category] }} aria-hidden="true" />
              )}
              <span className="min-w-0 flex-1 truncate">{e.exerciseName}</span>
              <span className="num shrink-0 text-muted">
                {e.sets} × {e.reps ?? "–"}
                {loadText(e, u)}
              </span>
            </li>
          ))}
          {t.exercises.length > shown.length && <li className="text-muted">+{t.exercises.length - shown.length} more</li>}
        </ol>
      )}
      <div className="mt-4 flex gap-2">
        {!rest && (
          <Button size="sm" variant="secondary" className="flex-1" onClick={onStart} loading={starting}>
            {!starting && <Play className="size-4" aria-hidden="true" />}
            Start Now
          </Button>
        )}
        <Button size="sm" variant="secondary" className="flex-1" onClick={onSchedule}>
          <CalendarPlus className="size-4" aria-hidden="true" />
          Schedule…
        </Button>
      </div>
    </Card>
  );
}

// ---------- Editor ----------

const intOrNull = (min: number, max: number, msg: string) => z.number().int(msg).min(min, msg).max(max, msg).nullable();

const itemSchema = z
  .object({
    exerciseId: z.string(),
    name: z.string(),
    category: z.string(),
    sets: z.number({ error: "Sets: 1–20." }).int("Sets: 1–20.").min(1, "Sets: 1–20.").max(20, "Sets: 1–20."),
    reps: intOrNull(1, 1000, "Reps: 1–1000."),
    loadMode: z.enum(["weight", "percent"]),
    load: z.number().min(0, "Load can’t be negative.").nullable(),
    restSeconds: intOrNull(0, 3600, "Rest: 0–3600 s."),
    tempo: z.string().trim().regex(/^$|^[0-9Xx]{1,2}(-[0-9Xx]{1,2}){2,3}$/, "Tempo like 3-1-1-0."),
    rpe: z.number().min(1, "RPE: 1–10.").max(10, "RPE: 1–10.").nullable(),
    rir: intOrNull(0, 10, "RIR: 0–10."),
    notes: z.string().max(500, "Notes: up to 500 characters."),
    group: z.number().int().min(1).max(20).nullable(),
    groupType: z.enum(["Superset", "Circuit"]),
  })
  .superRefine((v, ctx) => {
    if (v.load === null) return;
    if (v.loadMode === "percent" && (v.load < 30 || v.load > 110)) ctx.addIssue({ code: "custom", path: ["load"], message: "% of 1RM: 30–110." });
  });

const schema = z
  .object({
    name: z.string().trim().min(1, "Name the template.").max(100, "Up to 100 characters."),
    description: z.string().max(500, "Up to 500 characters."),
    kind: z.enum(["Workout", "RestDay"]),
    exercises: z.array(itemSchema),
  })
  .superRefine((v, ctx) => {
    if (v.kind === "RestDay" && v.exercises.length > 0)
      ctx.addIssue({ code: "custom", path: ["exercises"], message: "A rest day has no exercises. Remove them or switch back to Workout." });
    if (v.kind === "Workout" && v.exercises.length === 0) ctx.addIssue({ code: "custom", path: ["exercises"], message: "Add at least one exercise." });
    if (v.exercises.length > 50) ctx.addIssue({ code: "custom", path: ["exercises"], message: "Up to 50 exercises." });
  });
type Form = z.infer<typeof schema>;
type Item = Form["exercises"][number];

const newItem = (e: { id: string; name: string; category: ExerciseCategory }): Item => ({
  exerciseId: e.id,
  name: e.name,
  category: e.category,
  sets: 3,
  reps: e.category === "Strength" ? 8 : null,
  loadMode: "weight",
  load: null,
  restSeconds: e.category === "Strength" ? 90 : null,
  tempo: "",
  rpe: null,
  rir: null,
  notes: "",
  group: null,
  groupType: "Superset",
});

export function TemplateEditor({ template, onDone }: { template: Template | null; onDone: () => void }) {
  const u = useUnits();
  const [picker, setPicker] = useState(false);
  const {
    register,
    control,
    handleSubmit,
    setError,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: template?.name ?? "",
      description: template?.description ?? "",
      kind: template?.kind ?? "Workout",
      exercises: (template?.exercises ?? []).map((e) => ({
        exerciseId: e.exerciseId,
        name: e.exerciseName,
        category: e.category,
        sets: e.sets,
        reps: e.reps,
        loadMode: e.targetPercent1Rm !== null ? "percent" : "weight",
        load: e.targetPercent1Rm ?? (e.targetWeightKg === null ? null : u.toWeight(e.targetWeightKg)),
        restSeconds: e.restSeconds,
        tempo: e.tempo ?? "",
        rpe: e.rpe,
        rir: e.rir,
        notes: e.notes ?? "",
        group: e.group,
        groupType: e.groupType ?? "Superset",
      })),
    },
  });
  const ex = useFieldArray({ control, name: "exercises" });
  const kind = watch("kind");
  const items = watch("exercises");

  const onSubmit = handleSubmit(async (v) => {
    const body: TemplateInput = {
      name: v.name.trim(),
      description: v.description.trim() || null,
      kind: v.kind,
      exercises: v.exercises.map((e) => ({
        exerciseId: e.exerciseId,
        sets: e.sets,
        reps: e.reps,
        targetWeightKg: e.loadMode === "weight" && e.load !== null ? u.fromWeight(e.load) : null,
        targetPercent1Rm: e.loadMode === "percent" ? e.load : null,
        restSeconds: e.restSeconds,
        tempo: e.tempo.trim() || null,
        rpe: e.rpe,
        rir: e.rir,
        notes: e.notes.trim() || null,
        group: e.group,
        groupType: e.group === null ? null : (e.groupType as GroupType),
      })),
    };
    try {
      if (template) await api.put<Template>(`/api/templates/${template.id}`, body);
      else await api.post<Template>("/api/templates", body);
      toast.success("Template saved");
      onDone();
    } catch (e) {
      renameFieldErrors(e, (k) => k.replace(/\.(targetWeightKg|targetPercent1Rm)$/, ".load"));
      if (!applyFieldErrors(e, setError)) toast.error(errorMessage(e));
    }
  });

  const listError = errors.exercises?.root?.message ?? errors.exercises?.message;

  return (
    <>
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <Field label="Name" error={errors.name?.message}>
          <Input autoComplete="off" placeholder="Push day…" {...register("name")} />
        </Field>
        <Controller
          control={control}
          name="kind"
          render={({ field }) => (
            <Segmented<TemplateKind>
              label="Kind"
              value={field.value}
              onChange={field.onChange}
              options={[
                { value: "Workout", label: "Workout" },
                { value: "RestDay", label: "Rest day" },
              ]}
            />
          )}
        />
        <Field label="Description (optional)" error={errors.description?.message}>
          <Textarea autoComplete="off" rows={2} className="min-h-14" {...register("description")} />
        </Field>

        {(kind === "Workout" || ex.fields.length > 0) && (
          <fieldset>
            <legend className="mb-2 text-[0.8125rem]">Exercises</legend>
            {ex.fields.length > 0 && (
              <ol className="space-y-2">
                {ex.fields.map((f, i) => {
                  const it = items[i];
                  const g = it?.group ?? null;
                  const prevG = i > 0 ? (items[i - 1]?.group ?? null) : null;
                  return (
                    <li key={f.id}>
                      {g !== null && g !== prevG && (
                        <p className="mb-1 ml-1 text-[0.6875rem] tracking-[0.06em] uppercase" style={{ color: groupColor(g) }}>
                          {it?.groupType ?? "Superset"} {supersetLetter(g)}
                        </p>
                      )}
                      <ExerciseRow
                        i={i}
                        count={ex.fields.length}
                        item={it ?? f}
                        u={u}
                        register={register}
                        errors={errors.exercises?.[i]}
                        onMove={(to) => ex.move(i, to)}
                        onRemove={() => ex.remove(i)}
                        onToggleMode={() => {
                          setValue(`exercises.${i}.loadMode`, it?.loadMode === "percent" ? "weight" : "percent");
                          setValue(`exercises.${i}.load`, null);
                        }}
                      />
                    </li>
                  );
                })}
              </ol>
            )}
            {listError && (
              <p className="mt-2 text-xs text-danger" role="alert">
                {listError}
              </p>
            )}
            <div className="mt-2 flex flex-wrap gap-2">
              {kind === "Workout" ? (
                <Button size="sm" variant="secondary" onClick={() => setPicker(true)}>
                  <Plus className="size-4" aria-hidden="true" />
                  Add Exercise
                </Button>
              ) : (
                <Button size="sm" variant="secondary" onClick={() => ex.replace([])}>
                  Remove All Exercises
                </Button>
              )}
            </div>
          </fieldset>
        )}

        <div className="flex flex-col-reverse gap-2 border-t border-line pt-4 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" loading={isSubmitting}>
            {isSubmitting ? "Saving…" : "Save Template"}
          </Button>
        </div>
      </form>
      <ExercisePicker open={picker} onClose={() => setPicker(false)} onPick={(e) => ex.append(newItem(e))} />
    </>
  );
}

type RowErrors = Partial<Record<keyof Item, { message?: string }>> | undefined;

function ExerciseRow({
  i,
  count,
  item,
  u,
  register,
  errors,
  onMove,
  onRemove,
  onToggleMode,
}: {
  i: number;
  count: number;
  item: Item;
  u: Units;
  register: UseFormRegister<Form>;
  errors: RowErrors;
  onMove: (to: number) => void;
  onRemove: () => void;
  onToggleMode: () => void;
}) {
  const num = { setValueAs: numOrNull };
  const name = item.name;
  const pct = item.loadMode === "percent";
  // The first invalid field gets focus on submit; keep it red rather than the accent focus colour.
  const cell = "h-11 px-2 text-center sm:h-10 aria-[invalid=true]:focus:border-danger aria-[invalid=true]:outline-danger";
  const label = "flex min-w-0 flex-col gap-1 text-[0.6875rem] text-muted";
  const messages = errors ? [...new Set(Object.values(errors).map((e) => e?.message).filter(Boolean))] : [];
  const [detailsOpen] = useState(() => !!(item.tempo || item.rpe !== null || item.rir !== null || item.notes || item.group !== null));
  return (
    <div
      className="rounded-2xl border border-line bg-surface-2/40 p-3"
      style={item.group !== null ? { borderLeftColor: groupColor(item.group), borderLeftWidth: 3 } : undefined}
    >
      <div className="flex items-center gap-2">
        <span className="h-4 w-1 shrink-0 rounded-full" style={{ background: categoryColor[item.category as ExerciseCategory] ?? "var(--muted)" }} aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate text-[0.8125rem]">
          <span className="text-muted num">{i + 1}. </span>
          {name}
        </span>
        <div className="-my-1 -mr-1 flex shrink-0">
          <IconButton label={`Move ${name} up`} onClick={() => i > 0 && onMove(i - 1)}>
            <ArrowUp className={cx("size-4", i === 0 && "opacity-30")} aria-hidden="true" />
          </IconButton>
          <IconButton label={`Move ${name} down`} onClick={() => i < count - 1 && onMove(i + 1)}>
            <ArrowDown className={cx("size-4", i === count - 1 && "opacity-30")} aria-hidden="true" />
          </IconButton>
          <IconButton label={`Remove ${name}`} onClick={onRemove} danger>
            <X className="size-4" aria-hidden="true" />
          </IconButton>
        </div>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-[1fr_1fr_1fr_1.8fr]">
        <label className={label}>
          Sets
          <Input type="number" inputMode="numeric" autoComplete="off" aria-invalid={!!errors?.sets} className={cell} {...register(`exercises.${i}.sets`, num)} />
        </label>
        <label className={label}>
          Reps
          <Input type="number" inputMode="numeric" autoComplete="off" aria-invalid={!!errors?.reps} className={cell} {...register(`exercises.${i}.reps`, num)} />
        </label>
        <label className={label}>
          Rest (sec)
          <Input type="number" inputMode="numeric" step={15} autoComplete="off" aria-invalid={!!errors?.restSeconds} className={cell} {...register(`exercises.${i}.restSeconds`, num)} />
        </label>
        <div className={cx(label, "max-sm:col-span-3")}>
          <span id={`load-${i}`}>{pct ? "% of 1RM" : `Weight (${u.weight})`}</span>
          <div className="flex gap-1">
            <Input
              type="number"
              inputMode="decimal"
              step={pct ? 5 : 0.5}
              autoComplete="off"
              aria-labelledby={`load-${i}`}
              aria-invalid={!!errors?.load}
              className={cx(cell, "min-w-0")}
              {...register(`exercises.${i}.load`, num)}
            />
            <button
              type="button"
              onClick={onToggleMode}
              aria-label={pct ? `Use a weight in ${u.weight} instead` : "Use % of 1RM instead"}
              title={pct ? `Switch to ${u.weight}` : "Switch to % of 1RM"}
              className="h-11 shrink-0 rounded-xl border border-line px-2 text-[0.6875rem] text-ink hover:border-accent/50 sm:h-10"
            >
              {pct ? "%" : u.weight}
              <span className="text-muted" aria-hidden="true">
                ⇄
              </span>
            </button>
          </div>
        </div>
      </div>
      <details className="group mt-2" open={detailsOpen || !!(errors?.tempo || errors?.rpe || errors?.rir || errors?.notes) || undefined}>
        <summary className="flex min-h-9 cursor-pointer items-center text-[0.6875rem] text-muted select-none hover:text-ink">
          Tempo, effort, grouping, notes
        </summary>
        <div className="mt-1 grid grid-cols-3 gap-2 sm:grid-cols-[1fr_1fr_1fr_1fr_1.5fr]">
          <label className={label}>
            Tempo
            <Input autoComplete="off" placeholder="3-1-1-0" aria-invalid={!!errors?.tempo} className={cell} {...register(`exercises.${i}.tempo`)} />
          </label>
          <label className={label}>
            RPE
            <Input type="number" inputMode="decimal" step={0.5} autoComplete="off" aria-invalid={!!errors?.rpe} className={cell} {...register(`exercises.${i}.rpe`, num)} />
          </label>
          <label className={label}>
            RIR
            <Input type="number" inputMode="numeric" autoComplete="off" aria-invalid={!!errors?.rir} className={cell} {...register(`exercises.${i}.rir`, num)} />
          </label>
          <label className={cx(label, "max-sm:col-span-1")}>
            Group
            <Select className="h-11 px-2 pr-7 sm:h-10" {...register(`exercises.${i}.group`, { setValueAs: (v) => (v === "" || v === null ? null : Number(v)) })}>
              <option value="" aria-label="No group">–</option>
              {Array.from({ length: 8 }, (_, g) => (
                <option key={g} value={g + 1}>
                  {supersetLetter(g + 1)}
                </option>
              ))}
            </Select>
          </label>
          <label className={cx(label, "max-sm:col-span-2")}>
            Group type
            <Select className="h-11 px-2 pr-7 sm:h-10" {...register(`exercises.${i}.groupType`)}>
              <option value="Superset">Superset</option>
              <option value="Circuit">Circuit</option>
            </Select>
          </label>
          <label className={cx(label, "col-span-3 sm:col-span-5")}>
            Notes
            <Input autoComplete="off" placeholder="Pause at the bottom…" aria-invalid={!!errors?.notes} className="h-11 px-3 sm:h-10" {...register(`exercises.${i}.notes`)} />
          </label>
        </div>
      </details>
      {messages.length > 0 && (
        <p className="mt-2 text-xs text-danger" role="alert">
          {messages.join(" ")}
        </p>
      )}
    </div>
  );
}
