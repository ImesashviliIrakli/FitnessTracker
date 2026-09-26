import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Plus, Search } from "lucide-react";
import { api, applyFieldErrors, errorMessage } from "../lib/api";
import { numOrNull } from "../lib/format";
import { categoryColor } from "../lib/training";
import type { Exercise, ExerciseCategory } from "../lib/types";
import { Button, Dialog, ErrorState, Field, Input, Loading, Select } from "./ui";

export const exercisesQuery = { queryKey: ["exercises"], queryFn: () => api.get<Exercise[]>("/api/exercises"), staleTime: 5 * 60_000 };

const categories: ExerciseCategory[] = ["Strength", "Cardio", "Mobility", "Sport"];

export function ExercisePicker({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (e: Exercise) => void }) {
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const q = useQuery(exercisesQuery);
  const searchRef = useRef<HTMLInputElement>(null);

  // Focus the search box once the <dialog> is modal. `autoFocus` alone loses to showModal() focusing the
  // Close button (and to a parent dialog, when nested), so wait a frame after the dialog has opened.
  useEffect(() => {
    if (!open || creating) return;
    const f = requestAnimationFrame(() => searchRef.current?.focus());
    return () => cancelAnimationFrame(f);
  }, [open, creating]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return (q.data ?? []).filter((e) => !s || e.name.toLowerCase().includes(s) || e.primaryMuscle?.toLowerCase().includes(s));
  }, [q.data, search]);

  const close = () => {
    setSearch("");
    setCreating(false);
    onClose();
  };
  const pick = (e: Exercise) => {
    onPick(e);
    close();
  };

  return (
    <Dialog open={open} onClose={close} title={creating ? "New Exercise" : "Add Exercise"} wide>
      {creating ? (
        <CustomExerciseForm initialName={search} onCancel={() => setCreating(false)} onCreated={pick} />
      ) : (
        <div className="space-y-3">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden="true" />
            <Input
              type="search"
              aria-label="Search exercises"
              placeholder="Name or muscle…"
              autoComplete="off"
              ref={searchRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          {q.isPending ? (
            <Loading />
          ) : q.isError ? (
            <ErrorState error={q.error} onRetry={() => q.refetch()} />
          ) : (
            <ul className="max-h-[50dvh] divide-y divide-line overflow-y-auto overscroll-contain rounded-lg border border-line" aria-label="Exercises">
              {filtered.map((e) => (
                <li key={e.id}>
                  <button type="button" onClick={() => pick(e)} className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-surface-2">
                    <span className="h-8 w-1 shrink-0 rounded-full" style={{ background: categoryColor[e.category] }} aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{e.name}</span>
                      <span className="block text-xs text-muted">
                        {e.category}
                        {e.primaryMuscle && `, ${e.primaryMuscle}`}
                        {e.isCustom && ", custom"}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
              {filtered.length === 0 && <li className="px-3 py-6 text-center text-sm text-muted">No exercise matches “{search}”.</li>}
            </ul>
          )}
          <Button variant="secondary" onClick={() => setCreating(true)}>
            <Plus className="size-4" aria-hidden="true" />
            Create Custom Exercise
          </Button>
        </div>
      )}
    </Dialog>
  );
}

const schema = z.object({
  name: z.string().trim().min(1, "Enter a name.").max(100),
  category: z.enum(["Strength", "Cardio", "Mobility", "Sport"]),
  primaryMuscle: z.string().trim().max(50),
  met: z.number().min(1, "MET is between 1 and 25.").max(25, "MET is between 1 and 25.").nullable(),
});
type Form = z.infer<typeof schema>;

function CustomExerciseForm({ initialName, onCancel, onCreated }: { initialName: string; onCancel: () => void; onCreated: (e: Exercise) => void }) {
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<Form>({ resolver: zodResolver(schema), defaultValues: { name: initialName, category: "Strength", primaryMuscle: "", met: null } });

  const onSubmit = handleSubmit(async (v) => {
    try {
      const created = await api.post<Exercise>("/api/exercises", { ...v, primaryMuscle: v.primaryMuscle || null });
      toast.success(`${created.name} added`);
      onCreated(created);
    } catch (e) {
      if (!applyFieldErrors(e, setError)) toast.error(errorMessage(e));
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4 sm:grid-cols-2">
      <Field label="Name" error={errors.name?.message} className="sm:col-span-2">
        <Input autoComplete="off" placeholder="Landmine press…" {...register("name")} />
      </Field>
      <Field label="Type" error={errors.category?.message}>
        <Select {...register("category")}>
          {categories.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </Select>
      </Field>
      <Field label="Main muscle (optional)" error={errors.primaryMuscle?.message}>
        <Input autoComplete="off" placeholder="Shoulders…" {...register("primaryMuscle")} />
      </Field>
      <Field
        label="MET value (optional)"
        error={errors.met?.message}
        hint="Intensity used to estimate calories burned. Brisk walking ≈ 4, running ≈ 10."
        className="sm:col-span-2"
      >
        <Input type="number" inputMode="decimal" step="0.1" autoComplete="off" {...register("met", { setValueAs: numOrNull })} />
      </Field>
      <div className="flex justify-end gap-2 sm:col-span-2">
        <Button variant="secondary" onClick={onCancel}>
          Back
        </Button>
        <Button type="submit" loading={isSubmitting}>
          {isSubmitting ? "Adding…" : "Add Exercise"}
        </Button>
      </div>
    </form>
  );
}
