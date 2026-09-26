import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { useQuery } from "@tanstack/react-query";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { api, applyFieldErrors, errorMessage } from "../lib/api";
import { useUnits } from "../lib/auth";
import { fmtDate, numOrNull, today } from "../lib/format";
import type { WeightEntry, WeightInput } from "../lib/types";
import { Button, Dialog, Field, Input, Textarea } from "./ui";
import { DateField } from "./DatePicker";

const num = { setValueAs: numOrNull };

/**
 * Add or edit a weigh-in. `entry` = edit mode. There's one weigh-in per day, so picking a date that already
 * has one (today, when opened to log) switches to editing that entry instead of failing on save.
 */
export function WeightDialog({ open, onClose, entry }: { open: boolean; onClose: () => void; entry?: WeightEntry | null }) {
  const [editing, setEditing] = useState(false);
  return (
    <Dialog open={open} onClose={onClose} title={entry || editing ? "Edit Weigh-in" : "Log Weight"}>
      {open && <WeightForm entry={entry ?? null} onDone={onClose} onEditing={setEditing} />}
    </Dialog>
  );
}

function WeightForm({ entry, onDone, onEditing }: { entry: WeightEntry | null; onDone: () => void; onEditing: (editing: boolean) => void }) {
  const u = useUnits();
  const weights = useQuery({ queryKey: ["weights"], queryFn: () => api.get<WeightEntry[]>("/api/weights") });
  const schema = z.object({
    date: z.string().min(1, "Pick a date.").refine((d) => d <= today(), "Weigh-ins can’t be in the future."),
    weight: z
      .number({ error: `Enter your weight in ${u.weight}.` })
      .refine((w) => u.fromWeight(w) >= 20 && u.fromWeight(w) <= 400, "That weight looks out of range."),
    bodyFatPercent: z.number().min(2, "Between 2 and 70%.").max(70, "Between 2 and 70%.").nullable(),
    note: z.string().max(500),
  });
  type Form = z.infer<typeof schema>;

  const {
    register,
    control,
    handleSubmit,
    setError,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: {
      date: entry?.date ?? today(),
      weight: entry ? u.toWeight(entry.weightKg) : (undefined as unknown as number),
      bodyFatPercent: entry?.bodyFatPercent ?? null,
      note: entry?.note ?? "",
    },
  });

  const date = watch("date");
  // The entry already on the chosen date (or the one being edited, which may be moving to a free date).
  const onDate = weights.data?.find((w) => w.date === date) ?? null;
  const target = onDate ?? entry;
  const switched = onDate !== null && onDate.id !== entry?.id;
  const loaded = useRef(entry?.id ?? null);
  useEffect(() => {
    onEditing(target !== null);
    if (!onDate || loaded.current === onDate.id) return;
    loaded.current = onDate.id;
    setValue("weight", u.toWeight(onDate.weightKg));
    setValue("bodyFatPercent", onDate.bodyFatPercent);
    setValue("note", onDate.note ?? "");
  }, [onDate, target, onEditing, setValue, u]);

  const onSubmit = handleSubmit(async (v) => {
    const body: WeightInput = {
      date: v.date,
      weightKg: u.fromWeight(v.weight),
      bodyFatPercent: v.bodyFatPercent,
      note: v.note.trim() || null,
    };
    try {
      if (target) await api.put(`/api/weights/${target.id}`, body);
      else await api.post("/api/weights", body);
      toast.success(target ? "Weigh-in updated" : "Weight logged");
      onDone();
    } catch (e) {
      if (e instanceof Error && "status" in e && e.status === 409)
        setError("date", { message: "You already logged a weight on this date. Edit that entry instead." });
      else if (!applyFieldErrors(e, setError)) toast.error(errorMessage(e));
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      {switched && (
        <p role="status" className="rounded-xl border border-line bg-surface-2/70 px-3 py-2 text-[0.8125rem] leading-snug text-muted">
          {date === today() ? "You already logged today — editing that entry." : `You already logged on ${fmtDate(date)} — editing that entry.`}
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] sm:gap-3">
        <DateField control={control} name="date" label="Date" error={errors.date?.message} max={today()} required />
        <Field label={`Weight (${u.weight})`} error={errors.weight?.message}>
          <Input type="number" inputMode="decimal" step="0.1" autoComplete="off" autoFocus {...register("weight", num)} />
        </Field>
      </div>
      <Field label="Body fat % (optional)" error={errors.bodyFatPercent?.message} hint="Adds lean mass and a more accurate calorie estimate.">
        <Input type="number" inputMode="decimal" step="0.1" autoComplete="off" {...register("bodyFatPercent", num)} />
      </Field>
      <Field label="Note (optional)" error={errors.note?.message}>
        <Textarea autoComplete="off" placeholder="Morning, after a rest day…" {...register("note")} />
      </Field>
      <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" loading={isSubmitting}>
          {isSubmitting ? "Saving…" : target ? "Save Changes" : "Log Weight"}
        </Button>
      </div>
    </form>
  );
}
