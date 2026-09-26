import { useEffect, useRef, useState, type FormEvent } from "react";
import { Navigate, useNavigate } from "react-router";
import { toast } from "sonner";
import { ArrowLeftRight, CloudOff, Flame, Plus, SkipForward, Timer, Trash2, Undo2, X } from "lucide-react";
import { errorMessage } from "../lib/api";
import { useUnits } from "../lib/auth";
import { numOrNull } from "../lib/format";
import { supersetLetter } from "../lib/training";
import type { Exercise, Session, SessionExercise, SessionSet, SessionSummary } from "../lib/types";
import { Button, ConfirmDialog, cx, Dialog, ErrorState, Field, Input, Loading, Textarea } from "../components/ui";
import { ExercisePicker } from "../components/ExercisePicker";
import { cardId, ExerciseCard } from "../features/session/ExerciseCard";
import { SessionSummaryView } from "../features/session/SessionSummaryView";
import { blocks, currentExercise, elapsedSeconds, exerciseDone, fmtClock, progress, reduce, restAfter, type Action } from "../features/session/session";
import { useNow, useSessionDraft, type SyncStatus } from "../features/session/useSessionDraft";

export default function SessionPage() {
  const draft = useSessionDraft();
  const [summary, setSummary] = useState<SessionSummary | null>(null);

  if (summary) return <SessionSummaryView summary={summary} />;
  if (draft.loadError) return <ErrorState error={draft.loadError} onRetry={draft.retryLoad} />;
  if (draft.session === undefined) return <Loading label="Loading your workout…" />;
  if (draft.session === null) return <Navigate to="/workouts" replace />;
  return <LiveSession session={draft.session} draft={draft} onFinished={setSummary} />;
}

type Draft = ReturnType<typeof useSessionDraft>;
type Rest = { endsAt: number; total: number };

function LiveSession({ session, draft, onFinished }: { session: Session; draft: Draft; onFinished: (s: SessionSummary) => void }) {
  const u = useUnits();
  const navigate = useNavigate();
  const { dispatch } = draft;
  const { done, total } = progress(session);
  // The "current" exercise only moves when a set is checked (never on an edit or blur), or when it
  // stops being one (skipped, removed) and something else has to take its place.
  const [currentId, setCurrentId] = useState(() => currentExercise(session)?.id ?? null);
  const current = session.exercises.find((ex) => ex.id === currentId && !ex.skipped) ?? null;
  useEffect(() => {
    if (!current) setCurrentId(currentExercise(session)?.id ?? null);
  }, [current, session]);
  const [openOverride, setOpenOverride] = useState<Record<string, boolean>>({});
  const [picker, setPicker] = useState<{ mode: "add" } | { mode: "swap"; exId: string } | null>(null);
  const [exOptions, setExOptions] = useState<string | null>(null);
  const [setOptions, setSetOptions] = useState<{ exId: string; setId: string; label: string } | null>(null);
  const [finishing, setFinishing] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [discardBusy, setDiscardBusy] = useState(false);
  const [rest, setRest] = useState<Rest | null>(null);

  const isOpen = (ex: SessionExercise) => openOverride[ex.id] ?? (!ex.skipped && ex.id === current?.id);
  const toggleOpen = (ex: SessionExercise) => setOpenOverride((o) => ({ ...o, [ex.id]: !isOpen(ex) }));

  const check = (ex: SessionExercise, set: SessionSet) => {
    const a: Action = { type: "toggleSet", exId: ex.id, setId: set.id };
    dispatch(a);
    const nextId = currentExercise(reduce(session, a))?.id ?? null;
    if (nextId !== currentId) {
      // The card being left collapses, unless someone is typing in it or it holds a value the UI refused.
      const prev = currentId ? document.getElementById(cardId(currentId)) : null;
      const focus = document.activeElement;
      const typing = !!prev && prev.contains(focus) && (focus instanceof HTMLInputElement || focus instanceof HTMLTextAreaElement);
      if (prev && currentId && (typing || prev.querySelector('[aria-invalid="true"]'))) setOpenOverride((o) => ({ ...o, [currentId]: true }));
      else if (prev?.contains(focus) && nextId) requestAnimationFrame(() => document.getElementById(`${cardId(nextId)}-head`)?.focus());
      setCurrentId(nextId);
    }
    if (set.done) return;
    const seconds = restAfter(session, ex.id);
    setRest(seconds > 0 ? { endsAt: Date.now() + seconds * 1000, total: seconds } : null);
  };

  const onPick = (e: Exercise) => {
    if (picker?.mode === "swap") dispatch({ type: "swapExercise", exId: picker.exId, exercise: e });
    else dispatch({ type: "addExercise", exercise: e });
  };

  const removeSet = (exId: string, setId: string) => {
    const ex = session.exercises.find((x) => x.id === exId);
    const index = ex?.sets.findIndex((x) => x.id === setId) ?? -1;
    if (!ex || index < 0) return;
    const set = ex.sets[index]!;
    dispatch({ type: "removeSet", exId, setId });
    toast("Set removed", { action: { label: "Undo", onClick: () => dispatch({ type: "insertSet", exId, index, set }) } });
  };

  const discard = async () => {
    setDiscardBusy(true);
    try {
      await draft.discard();
      toast.success("Workout discarded");
      navigate("/workouts", { replace: true });
    } catch (e) {
      toast.error(errorMessage(e));
      setDiscardBusy(false);
    }
  };

  const optionsEx = session.exercises.find((x) => x.id === exOptions);
  const optionsSetEx = session.exercises.find((x) => x.id === setOptions?.exId);
  const optionsSet = optionsSetEx?.sets.find((x) => x.id === setOptions?.setId);

  return (
    <div className="md:mx-auto md:max-w-2xl">
      <SessionHeader session={session} done={done} total={total} current={current} status={draft.status} onDiscard={() => setDiscarding(true)} />

      <ol className="mt-4 space-y-3" aria-label="Exercises">
        {blocks(session.exercises).map((b) => {
          const cards = b.items.map((ex) => (
            <ExerciseCard
              key={ex.id}
              ex={ex}
              u={u}
              current={ex.id === current?.id}
              open={isOpen(ex)}
              onToggle={() => toggleOpen(ex)}
              dispatch={dispatch}
              onCheck={check}
              onOptions={() => setExOptions(ex.id)}
              onSetOptions={(set, label) => setSetOptions({ exId: ex.id, setId: set.id, label })}
              serverErrors={draft.fieldErrors}
            />
          ));
          return (
            <li key={b.items[0]!.id}>
              {b.group !== null && b.items.length > 1 ? (
                <div className="rounded-[1.5rem] border border-dashed border-accent/35 p-1.5">
                  <p className="px-3 pt-1.5 pb-2 text-[0.625rem] tracking-[0.1em] text-accent-fg uppercase">
                    {b.groupType === "Circuit" ? "Circuit" : "Superset"} {supersetLetter(b.group)}
                  </p>
                  <div className="space-y-1.5">{cards}</div>
                </div>
              ) : (
                cards
              )}
            </li>
          );
        })}
      </ol>

      {session.exercises.length === 0 && (
        <div className="mt-4 rounded-[1.25rem] border border-dashed border-line px-5 py-8 text-center">
          <p className="text-[0.9375rem]">Empty session</p>
          <p className="mt-1 text-[0.8125rem] text-muted">Add your first exercise to start logging sets.</p>
        </div>
      )}

      <Button variant="secondary" className="mt-3 w-full" onClick={() => setPicker({ mode: "add" })}>
        <Plus className="size-4" aria-hidden="true" />
        Add Exercise
      </Button>

      <Field label="Session notes" className="mt-6">
        <Textarea
          placeholder="How it felt, what to change next time…"
          maxLength={2000}
          value={session.notes ?? ""}
          onChange={(e) => dispatch({ type: "sessionNotes", notes: e.target.value })}
        />
      </Field>

      <div className="sticky bottom-[calc(5.75rem+env(safe-area-inset-bottom))] z-30 mt-6 md:bottom-4">
        <div className="flex items-center gap-2 rounded-[1.5rem] border border-line bg-shell/90 p-2 shadow-2xl shadow-black/40 backdrop-blur-xl">
          {rest && <RestTimer rest={rest} onChange={setRest} />}
          <Button className="min-w-0 flex-1" onClick={() => setFinishing(true)}>
            Finish Workout
          </Button>
        </div>
      </div>

      <ExercisePicker open={picker !== null} onClose={() => setPicker(null)} onPick={onPick} />

      <Dialog open={!!optionsEx} onClose={() => setExOptions(null)} title={optionsEx?.exerciseName ?? ""}>
        {optionsEx && (
          <ExerciseOptions
            ex={optionsEx}
            dispatch={dispatch}
            onSwap={() => {
              setExOptions(null);
              setPicker({ mode: "swap", exId: optionsEx.id });
            }}
            onClose={() => setExOptions(null)}
          />
        )}
      </Dialog>

      <Dialog open={!!optionsSet} onClose={() => setSetOptions(null)} title={`${optionsSetEx?.exerciseName ?? ""}: ${setOptions?.label ?? ""}`}>
        {optionsSet && optionsSetEx && (
          <div className="grid gap-2">
            <Button
              variant="secondary"
              onClick={() => {
                dispatch({ type: "updateSet", exId: optionsSetEx.id, setId: optionsSet.id, patch: { isWarmup: !optionsSet.isWarmup } });
                setSetOptions(null);
              }}
            >
              <Flame className="size-4" aria-hidden="true" />
              {optionsSet.isWarmup ? "Make Working Set" : "Mark as Warm-up"}
            </Button>
            <Button
              variant="secondary"
              className="text-danger"
              onClick={() => {
                removeSet(optionsSetEx.id, optionsSet.id);
                setSetOptions(null);
              }}
            >
              <Trash2 className="size-4" aria-hidden="true" />
              Remove Set
            </Button>
          </div>
        )}
      </Dialog>

      <FinishDialog open={finishing} onClose={() => setFinishing(false)} session={session} done={done} total={total} draft={draft} onFinished={onFinished} />

      <ConfirmDialog
        open={discarding}
        onClose={() => setDiscarding(false)}
        onConfirm={discard}
        loading={discardBusy}
        title="Discard this workout?"
        body="Every set you logged in this session will be deleted. This can’t be undone."
        confirmLabel="Discard Workout"
      />
    </div>
  );
}

const statusText: Record<SyncStatus, string> = { saved: "Saved", saving: "Saving…", offline: "Offline · will retry", error: "Not saved" };

function SessionHeader({
  session,
  done,
  total,
  current,
  status,
  onDiscard,
}: {
  session: Session;
  done: number;
  total: number;
  current: SessionExercise | null;
  status: SyncStatus;
  onDiscard: () => void;
}) {
  const now = useNow();
  const pct = total ? (done / total) * 100 : 0;
  return (
    <header className="sticky top-0 z-40 -mx-4 -mt-5 border-b border-line/70 bg-bg/90 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 backdrop-blur-xl sm:-mx-6 sm:px-6 md:top-3 md:-mx-4 md:mt-0 md:rounded-[1.25rem] md:border md:px-4 md:pt-3">
      <div className="flex items-center gap-2">
        <h1 className="min-w-0 flex-1 truncate text-[1rem] leading-tight sm:text-[1.125rem]" title={session.name}>
          {session.name}
        </h1>
        <span className={cx("flex shrink-0 items-center gap-1.5 text-[0.6875rem]", status === "offline" || status === "error" ? "text-warning" : "text-muted")}>
          {status === "offline" ? (
            <CloudOff className="size-3.5" aria-hidden="true" />
          ) : (
            <span className={cx("size-1.5 rounded-full", status === "saving" ? "bg-muted motion-safe:animate-pulse" : status === "error" ? "bg-warning" : "bg-success")} aria-hidden="true" />
          )}
          {statusText[status]}
        </span>
        <button
          type="button"
          onClick={onDiscard}
          aria-label="Discard workout"
          className="-mr-2 grid size-11 shrink-0 place-items-center rounded-xl text-muted hover:bg-danger/10 hover:text-danger"
        >
          <Trash2 className="size-4" aria-hidden="true" />
        </button>
      </div>
      <div className="mt-1 flex items-end justify-between gap-3">
        <p className="stat text-[1.75rem] leading-none tracking-[-0.02em] sm:text-[2rem]" role="timer" aria-label="Elapsed time">
          {fmtClock(elapsedSeconds(session.startedAt, now))}
        </p>
        <p className="num text-[0.75rem] text-muted" aria-live="polite">
          <span className="stat text-[1.125rem] text-ink">
            {done}/{total}
          </span>{" "}
          sets
        </p>
      </div>
      <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-surface-2" aria-hidden="true">
        <div className="h-full rounded-full bg-accent transition-[width] duration-300" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-2 truncate text-[0.75rem] text-muted">
        {current ? (
          <>
            Now: <span className="text-accent-fg">{current.exerciseName}</span>
          </>
        ) : total > 0 ? (
          "All sets done. Finish when you’re ready."
        ) : (
          "Add an exercise to begin."
        )}
      </p>
    </header>
  );
}

/** Counts down after a set; +15 s / dismiss; buzzes and announces when it's over. */
function RestTimer({ rest, onChange }: { rest: Rest; onChange: (r: Rest | null) => void }) {
  const now = useNow();
  const left = Math.ceil((rest.endsAt - now) / 1000);
  const over = left <= 0;
  const buzzed = useRef(false);
  useEffect(() => {
    buzzed.current = false;
  }, [rest.endsAt]);
  useEffect(() => {
    if (!over || buzzed.current) return;
    buzzed.current = true;
    navigator.vibrate?.([120, 80, 120]);
    const t = setTimeout(() => onChange(null), 4000);
    return () => clearTimeout(t);
  }, [over, onChange]);

  return (
    <div className={cx("flex shrink-0 items-center gap-1 rounded-xl border pl-3", over ? "border-success/50 bg-success/10" : "border-accent/35 bg-accent/10")}>
      <Timer className={cx("size-4", over ? "text-success" : "text-accent-fg")} aria-hidden="true" />
      <span role="timer" aria-label="Rest timer" className="stat min-w-[3.25rem] text-center text-[0.9375rem]">
        {over ? "Go" : fmtClock(left)}
      </span>
      <span className="sr-only" aria-live="assertive">
        {over ? "Rest over" : ""}
      </span>
      {!over && (
        <button
          type="button"
          onClick={() => onChange({ endsAt: rest.endsAt + 15_000, total: rest.total + 15 })}
          aria-label="Add 15 seconds of rest"
          className="num grid h-11 place-items-center rounded-lg px-1.5 text-[0.75rem] text-muted hover:text-ink"
        >
          +15
        </button>
      )}
      <button type="button" onClick={() => onChange(null)} aria-label="Dismiss rest timer" className="grid size-11 place-items-center rounded-lg text-muted hover:text-ink">
        <X className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}

function ExerciseOptions({ ex, dispatch, onSwap, onClose }: { ex: SessionExercise; dispatch: (a: Action) => void; onSwap: () => void; onClose: () => void }) {
  const act = (a: Action) => {
    dispatch(a);
    onClose();
  };
  const canRemove = exerciseDone(ex) === 0;
  return (
    <div className="grid gap-2">
      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" onClick={() => act({ type: "addSet", exId: ex.id })}>
          <Plus className="size-4" aria-hidden="true" />
          Add Set
        </Button>
        <Button variant="secondary" onClick={() => act({ type: "addSet", exId: ex.id, warmup: true })}>
          <Flame className="size-4" aria-hidden="true" />
          Warm-up Set
        </Button>
      </div>
      <Button variant="secondary" onClick={onSwap}>
        <ArrowLeftRight className="size-4" aria-hidden="true" />
        Swap Exercise
      </Button>
      <Button variant="secondary" onClick={() => act({ type: "skipExercise", exId: ex.id, skipped: !ex.skipped })}>
        {ex.skipped ? <Undo2 className="size-4" aria-hidden="true" /> : <SkipForward className="size-4" aria-hidden="true" />}
        {ex.skipped ? "Unskip Exercise" : "Skip Exercise"}
      </Button>
      {canRemove && (
        <Button variant="secondary" className="text-danger" onClick={() => act({ type: "removeExercise", exId: ex.id })}>
          <Trash2 className="size-4" aria-hidden="true" />
          Remove Exercise
        </Button>
      )}
      <Field label="Notes" className="mt-3">
        <Textarea
          placeholder="Seat height, grip, cues…"
          maxLength={500}
          value={ex.notes ?? ""}
          onChange={(e) => dispatch({ type: "exerciseNotes", exId: ex.id, notes: e.target.value })}
        />
      </Field>
    </div>
  );
}

function FinishDialog({
  open,
  onClose,
  session,
  done,
  total,
  draft,
  onFinished,
}: {
  open: boolean;
  onClose: () => void;
  session: Session;
  done: number;
  total: number;
  draft: Draft;
  onFinished: (s: SessionSummary) => void;
}) {
  const [notes, setNotes] = useState("");
  const [duration, setDuration] = useState("");
  const [busy, setBusy] = useState(false);
  const elapsedMin = Math.max(1, Math.round(elapsedSeconds(session.startedAt, Date.now()) / 60));
  useEffect(() => {
    if (open) setNotes(session.notes ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- prefill once per opening
  }, [open]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const minutes = numOrNull(duration);
      onFinished(await draft.finish({ notes: notes.trim() || null, durationMinutes: minutes === null ? null : Math.round(minutes) }));
    } catch (err) {
      toast.error(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} title="Finish workout?">
      <form onSubmit={submit} noValidate className="space-y-4">
        <p className="num text-[0.8125rem] leading-relaxed text-muted">
          <span className="text-ink">
            {done} of {total}
          </span>{" "}
          sets done · {elapsedMin} min.
          {done > 0 && done < total && " Unchecked sets won’t be logged."}
        </p>
        {done === 0 && (
          <p role="alert" className="rounded-xl border border-warning/40 bg-warning/10 p-3 text-[0.8125rem] text-warning">
            Check off at least one set before finishing.
          </p>
        )}
        <Field label="Notes (optional)">
          <Textarea maxLength={2000} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        <Field label="Duration in minutes (optional)" hint={`Leave empty to use the timer (${elapsedMin} min).`}>
          <Input type="number" inputMode="numeric" min={1} max={1440} placeholder={String(elapsedMin)} value={duration} onChange={(e) => setDuration(e.target.value)} />
        </Field>
        <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onClose}>
            Keep Going
          </Button>
          <Button type="submit" loading={busy} disabled={done === 0}>
            Finish Workout
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
