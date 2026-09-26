import { useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Ruler, Scale } from "lucide-react";
import { api, applyFieldErrors, ApiError, errorMessage } from "../lib/api";
import { useUnits } from "../lib/auth";
import { DateField } from "../components/DatePicker";
import { fmtDate, fmtDelta, fmtNum, numOrNull, today } from "../lib/format";
import { measurementKeys, type Measurement, type MeasurementInput, type MeasurementKey, type WeightEntry } from "../lib/types";
import type { Units } from "../lib/units";
import { WeightChart } from "../components/charts";
import { WeightDialog } from "../components/WeightDialog";
import {
  Button,
  Card,
  ConfirmDialog,
  Dialog,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Loading,
  PageHeader,
  RowActions,
  Segmented,
  Textarea,
} from "../components/ui";

const measurementLabels: Record<MeasurementKey, string> = {
  waistCm: "Waist",
  chestCm: "Chest",
  hipsCm: "Hips",
  armCm: "Arm",
  thighCm: "Thigh",
  neckCm: "Neck",
  shouldersCm: "Shoulders",
};

/** Exponentially smoothed trend (α = 0.1), the same idea the dashboard uses. */
export function withTrend<T extends { weightKg: number }>(rows: T[]) {
  let trend: number | null = null;
  return rows.map((r) => {
    trend = trend === null ? r.weightKg : trend + 0.1 * (r.weightKg - trend);
    return { ...r, trendKg: trend };
  });
}

export default function BodyPage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") === "measurements" ? "measurements" : "weight";
  return (
    <>
      <PageHeader
        title="Body"
        description="Weigh-ins and tape measurements. Trends matter more than any single day."
        actions={
          <Segmented
            label="Section"
            value={tab}
            onChange={(v) => setParams(v === "weight" ? {} : { tab: v }, { replace: true })}
            options={[
              { value: "weight", label: "Weight" },
              { value: "measurements", label: "Measurements" },
            ]}
          />
        }
      />
      {tab === "weight" ? <WeightTab /> : <MeasurementsTab />}
    </>
  );
}

function WeightTab() {
  const u = useUnits();
  const [dialog, setDialog] = useState<{ entry: WeightEntry | null } | null>(null);
  const [toDelete, setToDelete] = useState<WeightEntry | null>(null);
  const q = useQuery({ queryKey: ["weights"], queryFn: () => api.get<WeightEntry[]>("/api/weights") });
  const del = useMutation({
    mutationFn: (id: string) => api.del(`/api/weights/${id}`),
    onSuccess: () => {
      toast.success("Weigh-in deleted");
      setToDelete(null);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const series = useMemo(() => withTrend(q.data ?? []), [q.data]);

  return (
    <div className="space-y-4">
      <WeightDialog open={dialog !== null} entry={dialog?.entry} onClose={() => setDialog(null)} />
      <ConfirmDialog
        open={toDelete !== null}
        onClose={() => setToDelete(null)}
        onConfirm={() => toDelete && del.mutate(toDelete.id)}
        loading={del.isPending}
        title="Delete Weigh-in?"
        body={toDelete ? `The ${fmtDate(toDelete.date)} entry will be removed from your history and trend.` : ""}
        confirmLabel="Delete Weigh-in"
      />
      {/* One primary action per state: the empty state carries its own button. */}
      {!(q.isSuccess && q.data.length === 0) && (
        <div className="flex justify-end">
          <Button onClick={() => setDialog({ entry: null })}>
            <Scale className="size-4" aria-hidden="true" />
            Log Weight
          </Button>
        </div>
      )}

      {q.isPending ? (
        <Loading />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : q.data.length === 0 ? (
        <EmptyState icon={<Scale className="size-6" />} title="No weigh-ins yet" action={<Button onClick={() => setDialog({ entry: null })}>Log Weight</Button>}>
          Weigh yourself in the morning, after the bathroom and before eating, for the most consistent numbers.
        </EmptyState>
      ) : (
        <>
          {series.length >= 2 && (
            <Card aria-label="Weight trend, last 12 months">
              <WeightChart data={series} u={u} height={280} />
            </Card>
          )}
          <Card className="overflow-x-auto p-0 [contain:inline-size] sm:p-0">
            <table className="w-full text-left text-[0.8125rem] sm:text-sm">
              <caption className="sr-only">Weigh-ins, newest first</caption>
              <thead className="border-b border-line text-muted">
                <tr>
                  <th scope="col" className="py-3 pr-2 pl-4 text-xs font-normal">Date</th>
                  <th scope="col" className="px-2 py-3 text-right text-xs font-normal sm:px-4">Weight</th>
                  <th scope="col" className="hidden px-4 py-3 text-right text-xs font-normal whitespace-nowrap sm:table-cell">Body fat</th>
                  <th scope="col" className="hidden px-4 py-3 text-right text-xs font-normal whitespace-nowrap sm:table-cell">Lean mass</th>
                  <th scope="col" className="hidden px-4 py-3 text-right text-xs font-normal md:table-cell">BMI</th>
                  <th scope="col" className="w-0 px-1 py-3 sm:px-2"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="num divide-y divide-line">
                {[...q.data].reverse().map((e) => (
                  <tr key={e.id}>
                    <td className="py-2 pr-2 pl-4">
                      <span className="whitespace-nowrap">{fmtDate(e.date)}</span>
                      {e.note && <p className="max-w-[8.5rem] truncate text-[0.6875rem] text-muted sm:max-w-56">{e.note}</p>}
                    </td>
                    <td className="px-2 py-2 text-right font-semibold whitespace-nowrap sm:px-4">
                      {fmtNum(u.toWeight(e.weightKg), 1)} {u.weight}
                    </td>
                    <td className="hidden px-4 py-2 text-right whitespace-nowrap sm:table-cell">{e.bodyFatPercent !== null ? `${fmtNum(e.bodyFatPercent, 1)}%` : "–"}</td>
                    <td className="hidden px-4 py-2 text-right whitespace-nowrap sm:table-cell">
                      {e.leanMassKg !== null ? `${fmtNum(u.toWeight(e.leanMassKg), 1)} ${u.weight}` : "–"}
                    </td>
                    <td className="hidden px-4 py-2 text-right md:table-cell">{e.bmi !== null ? fmtNum(e.bmi, 1) : "–"}</td>
                    <td className="px-1 py-1 text-right whitespace-nowrap sm:px-2">
                      <RowActions label={fmtDate(e.date)} onEdit={() => setDialog({ entry: e })} onDelete={() => setToDelete(e)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}
    </div>
  );
}

function MeasurementsTab() {
  const u = useUnits();
  const [dialog, setDialog] = useState<{ entry: Measurement | null } | null>(null);
  const [toDelete, setToDelete] = useState<Measurement | null>(null);
  const q = useQuery({ queryKey: ["measurements"], queryFn: () => api.get<Measurement[]>("/api/measurements") });
  const del = useMutation({
    mutationFn: (id: string) => api.del(`/api/measurements/${id}`),
    onSuccess: () => {
      toast.success("Measurement deleted");
      setToDelete(null);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const rows = q.data ?? [];
  const first = rows[0];
  const last = rows.at(-1);

  return (
    <div className="space-y-4">
      <Dialog open={dialog !== null} onClose={() => setDialog(null)} title={dialog?.entry ? "Edit Measurements" : "Add Measurements"} wide>
        {dialog && <MeasurementForm entry={dialog.entry} u={u} onDone={() => setDialog(null)} />}
      </Dialog>
      <ConfirmDialog
        open={toDelete !== null}
        onClose={() => setToDelete(null)}
        onConfirm={() => toDelete && del.mutate(toDelete.id)}
        loading={del.isPending}
        title="Delete Measurements?"
        body={toDelete ? `All measurements from ${fmtDate(toDelete.date)} will be removed.` : ""}
        confirmLabel="Delete Measurements"
      />
      {!(q.isSuccess && rows.length === 0) && (
        <div className="flex justify-end">
          <Button onClick={() => setDialog({ entry: null })}>
            <Ruler className="size-4" aria-hidden="true" />
            Add Measurements
          </Button>
        </div>
      )}

      {q.isPending ? (
        <Loading />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState icon={<Ruler className="size-6" />} title="No measurements yet" action={<Button onClick={() => setDialog({ entry: null })}>Add Measurements</Button>}>
          Measure every 2–4 weeks at the same spots. Waist often moves when the scale doesn’t.
        </EmptyState>
      ) : (
        <>
          {first && last && first !== last && (
            <Card aria-label="Change since first measurement">
              <h2 className="text-[0.8125rem] text-muted">
                Change since {fmtDate(first.date)}
              </h2>
              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 min-[400px]:grid-cols-3 sm:grid-cols-4 lg:grid-cols-7">
                {measurementKeys.map((k) => {
                  const a = first[k];
                  const b = last[k];
                  return (
                    <div key={k}>
                      <dt className="text-xs text-muted">{measurementLabels[k]}</dt>
                      <dd className="num text-[0.9375rem] whitespace-nowrap">{a !== null && b !== null ? `${fmtDelta(u.toLength(b - a))} ${u.length}` : "–"}</dd>
                    </div>
                  );
                })}
              </dl>
            </Card>
          )}
          <ul className="space-y-3 sm:hidden" aria-label={`Measurements in ${u.length}, newest first`}>
            {[...rows].reverse().map((m) => (
              <li key={m.id} className="rounded-[1.25rem] border border-line bg-surface py-2 pr-1 pl-4">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="num text-[0.875rem]">{fmtDate(m.date)}</h3>
                  <div className="flex">
                    <RowActions label={fmtDate(m.date)} onEdit={() => setDialog({ entry: m })} onDelete={() => setToDelete(m)} />
                  </div>
                </div>
                <dl className="mt-1 mb-2 grid grid-cols-3 gap-x-3 gap-y-2 pr-3 min-[400px]:grid-cols-4">
                  {measurementKeys.map((k) => (
                    <div key={k} className="min-w-0">
                      <dt className="truncate text-[0.6875rem] text-muted">{measurementLabels[k]}</dt>
                      <dd className="num text-[0.875rem]">{m[k] !== null ? fmtNum(u.toLength(m[k]!), 1) : "–"}</dd>
                    </div>
                  ))}
                </dl>
              </li>
            ))}
          </ul>
          <Card className="hidden overflow-x-auto p-0 [contain:inline-size] sm:block sm:p-0">
            <table className="w-full min-w-[40rem] text-left text-sm">
              <caption className="sr-only">Measurements in {u.length}, newest first</caption>
              <thead className="border-b border-line text-muted">
                <tr>
                  <th scope="col" className="px-4 py-3 text-xs font-normal">Date</th>
                  {measurementKeys.map((k) => (
                    <th key={k} scope="col" className="px-3 py-3 text-right text-xs font-normal">
                      {measurementLabels[k]}
                    </th>
                  ))}
                  <th scope="col" className="px-4 py-3"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="num divide-y divide-line">
                {[...rows].reverse().map((m) => (
                  <tr key={m.id}>
                    <td className="px-4 py-2.5 whitespace-nowrap">{fmtDate(m.date)}</td>
                    {measurementKeys.map((k) => (
                      <td key={k} className="px-3 py-2.5 text-right">
                        {m[k] !== null ? fmtNum(u.toLength(m[k]!), 1) : "–"}
                      </td>
                    ))}
                    <td className="px-2 py-1.5 text-right whitespace-nowrap">
                      <RowActions label={fmtDate(m.date)} onEdit={() => setDialog({ entry: m })} onDelete={() => setToDelete(m)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}
    </div>
  );
}

function MeasurementForm({ entry, u, onDone }: { entry: Measurement | null; u: Units; onDone: () => void }) {
  const [lo, hi] = [u.toLength(10), u.toLength(300)];
  const range = z.number().min(lo, `Between ${lo} and ${hi} ${u.length}.`).max(hi, `Between ${lo} and ${hi} ${u.length}.`).nullable();
  const schema = z
    .object({
      date: z.string().min(1, "Pick a date.").refine((d) => d <= today(), "Can’t be in the future."),
      note: z.string().max(500),
      ...Object.fromEntries(measurementKeys.map((k) => [k, range])),
    })
    .refine((v) => measurementKeys.some((k) => (v as Record<string, unknown>)[k] != null), {
      message: "Enter at least one measurement.",
      path: ["waistCm"],
    });
  type Form = { date: string; note: string } & Record<MeasurementKey, number | null>;

  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<Form>({
    resolver: zodResolver(schema) as never,
    defaultValues: {
      date: entry?.date ?? today(),
      note: entry?.note ?? "",
      ...Object.fromEntries(measurementKeys.map((k) => [k, entry?.[k] != null ? u.toLength(entry[k]!) : null])),
    } as Form,
  });

  const onSubmit = handleSubmit(async (v) => {
    const body = {
      date: v.date,
      note: v.note.trim() || null,
      ...Object.fromEntries(measurementKeys.map((k) => [k, v[k] === null ? null : u.fromLength(v[k]!)])),
    } as MeasurementInput;
    try {
      if (entry) await api.put(`/api/measurements/${entry.id}`, body);
      else await api.post("/api/measurements", body);
      toast.success("Measurements saved");
      onDone();
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) setError("date", { message: "There’s already an entry for this date. Edit it instead." });
      else if (!applyFieldErrors(e, setError)) toast.error(errorMessage(e));
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      <DateField control={control} name="date" label="Date" error={errors.date?.message} max={today()} required className="sm:max-w-72" />
      <fieldset>
        <legend className="mb-2 text-xs leading-snug text-muted">In {u.length}. Leave blank what you didn’t measure.</legend>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {measurementKeys.map((k) => (
            <Field key={k} label={measurementLabels[k]} error={errors[k]?.message}>
              <Input type="number" inputMode="decimal" step="0.1" autoComplete="off" {...register(k, { setValueAs: numOrNull })} />
            </Field>
          ))}
        </div>
      </fieldset>
      <Field label="Note (optional)" error={errors.note?.message}>
        <Textarea autoComplete="off" {...register("note")} />
      </Field>
      <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" loading={isSubmitting}>
          {isSubmitting ? "Saving…" : "Save Measurements"}
        </Button>
      </div>
    </form>
  );
}
