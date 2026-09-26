import { useEffect, useState } from "react";
import { Check, ChevronDown, MoreHorizontal, Plus } from "lucide-react";
import type { Units } from "../../lib/units";
import type { ExerciseCategory, SessionExercise, SessionSet } from "../../lib/types";
import { cx, Input } from "../../components/ui";
import { exerciseDone, fmtClock, type Action } from "./session";
import type { FieldErrors } from "./useSessionDraft";

type Col = {
  label: string;
  /** Server field name, to match ProblemDetails `errors`. */
  field: keyof SessionSet;
  get: (x: SessionSet) => number | null;
  target?: (x: SessionSet) => number | null;
  patch: (n: number | null) => Partial<SessionSet>;
  decimal: boolean;
  /** Error for a typed (display-unit) value; null when the server will accept it. */
  check: (n: number) => string | null;
};

const round1 = (n: number) => Math.round(n * 10) / 10;
const minutes: Col = {
  label: "Min",
  field: "durationSeconds",
  get: (x) => (x.durationSeconds === null ? null : round1(x.durationSeconds / 60)),
  patch: (n) => ({ durationSeconds: n === null ? null : Math.round(n * 60) }),
  decimal: true,
  check: (n) => (n < 0 || n > 1440 ? "Minutes: 0 to 1440." : null),
};
const reps: Col = {
  label: "Reps",
  field: "reps",
  get: (x) => x.reps,
  target: (x) => x.targetReps,
  patch: (n) => ({ reps: n }),
  decimal: false,
  check: (n) => (!Number.isInteger(n) || n < 0 || n > 1000 ? "Reps: a whole number from 0 to 1000." : null),
};

/** Which actuals a set logs, by exercise type. All values are metric underneath. */
function columns(category: ExerciseCategory, u: Units): Col[] {
  if (category === "Cardio")
    return [
      minutes,
      {
        label: u.distance,
        field: "distanceM",
        get: (x) => (x.distanceM === null ? null : u.toDistance(x.distanceM)),
        patch: (n) => ({ distanceM: n === null ? null : u.fromDistance(n) }),
        decimal: true,
        check: (n) => (n < 0 || u.fromDistance(n) > 1_000_000 ? `Distance: 0 to ${u.toDistance(1_000_000)} ${u.distance}.` : null),
      },
    ];
  if (category !== "Strength") return [reps, minutes];
  return [
    {
      label: u.weight,
      field: "weightKg",
      get: (x) => (x.weightKg === null ? null : u.toWeight(x.weightKg)),
      target: (x) => (x.targetWeightKg === null ? null : u.toWeight(x.targetWeightKg)),
      patch: (n) => ({ weightKg: n === null ? null : u.fromWeight(n) }),
      decimal: true,
      check: (n) => (n < 0 || u.fromWeight(n) > 1000 ? `Weight: 0 to ${u.toWeight(1000)} ${u.weight}.` : null),
    },
    reps,
    {
      label: "RPE",
      field: "rpe",
      get: (x) => x.rpe,
      target: (x) => x.targetRpe,
      patch: (n) => ({ rpe: n }),
      decimal: true,
      check: (n) => (n < 1 || n > 10 || !Number.isInteger(n * 2) ? "RPE: 1 to 10, in half steps." : null),
    },
  ];
}
const grid = (n: number) => (n === 3 ? "grid-cols-[2.75rem_repeat(3,minmax(0,1fr))_3rem]" : "grid-cols-[2.75rem_repeat(2,minmax(0,1fr))_3rem]");

/** "" → null, "62,5" → 62.5, junk → NaN. */
function parse(text: string): number | null {
  const t = text.trim().replace(",", ".");
  return t === "" ? null : Number(t);
}

/** Validates typed text for a column: the number to commit, or the message to show. */
function validate(c: Col, text: string): { n: number | null } | { error: string } {
  const n = parse(text);
  if (n === null) return { n };
  if (!Number.isFinite(n)) return { error: `${c.label}: enter a number.` };
  const error = c.check(n);
  return error ? { error } : { n };
}

/**
 * Keeps the raw text while typing ("62." stays) and never rewrites what was typed: out-of-range input
 * stays visible with its error until fixed. Follows the value when it changes from outside.
 */
function NumField({
  value,
  onText,
  decimal,
  invalid,
  describedBy,
  ...rest
}: {
  value: number | null;
  onText: (text: string) => void;
  decimal: boolean;
  invalid: boolean;
  describedBy?: string;
  "aria-label": string;
  placeholder?: string;
}) {
  const [text, setText] = useState(value === null ? "" : String(value));
  useEffect(() => {
    if (parse(text) !== value) setText(value === null ? "" : String(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only external changes matter
  }, [value]);
  return (
    <Input
      {...rest}
      type="text"
      inputMode={decimal ? "decimal" : "numeric"}
      autoComplete="off"
      enterKeyHint="done"
      value={text}
      aria-invalid={invalid || undefined}
      aria-describedby={describedBy}
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => {
        setText(e.target.value);
        onText(e.target.value);
      }}
      // `px-1!`: Input's override check only spots a px- class at the very start, so force it.
      className="h-12 min-w-0 px-1! text-center text-base placeholder:text-muted/45 aria-[invalid=true]:ring-1 aria-[invalid=true]:ring-danger sm:h-11"
    />
  );
}

export const cardId = (exId: string) => `card-${exId}`;

export function ExerciseCard({
  ex,
  current,
  open,
  onToggle,
  dispatch,
  onCheck,
  onOptions,
  onSetOptions,
  serverErrors,
  u,
}: {
  ex: SessionExercise;
  current: boolean;
  open: boolean;
  onToggle: () => void;
  dispatch: (a: Action) => void;
  onCheck: (ex: SessionExercise, set: SessionSet) => void;
  onOptions: () => void;
  onSetOptions: (set: SessionSet, label: string) => void;
  /** Validation messages the server sent back, by set id and field. */
  serverErrors: FieldErrors;
  u: Units;
}) {
  const done = exerciseDone(ex);
  const total = ex.sets.length;
  const complete = total > 0 && done === total;
  const cols = columns(ex.category, u);
  const id = cardId(ex.id);
  const bodyId = `${id}-body`;
  // Typed values the UI refused (`setId:field` → message), and why a check was refused (by set id).
  const [bad, setBad] = useState<Record<string, string>>({});
  const [blocked, setBlocked] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!open) {
      setBad({});
      setBlocked({});
    }
  }, [open]);
  let working = 0;

  const onText = (x: SessionSet, c: Col, text: string) => {
    const key = `${x.id}:${c.field}`;
    const r = validate(c, text);
    setBlocked(({ [x.id]: _, ...rest }) => rest);
    if ("error" in r) return setBad((b) => ({ ...b, [key]: r.error }));
    setBad(({ [key]: _, ...rest }) => rest);
    if (r.n !== c.get(x)) dispatch({ type: "updateSet", exId: ex.id, setId: x.id, patch: c.patch(r.n) });
  };

  const tryCheck = (x: SessionSet) => {
    if (!x.done) {
      const why = cols.some((c) => bad[`${x.id}:${c.field}`])
        ? "Fix the highlighted value first."
        : ex.category === "Strength" && ((x.weightKg ?? x.targetWeightKg) === null || (x.reps ?? x.targetReps) === null)
          ? "Enter weight and reps to complete this set."
          : null;
      if (why) return setBlocked((b) => ({ ...b, [x.id]: why }));
    }
    onCheck(ex, x);
  };

  return (
    <section
      id={id}
      aria-label={ex.exerciseName}
      className={cx("rounded-[1.25rem] border bg-surface transition-colors", current ? "border-accent/45" : "border-line", ex.skipped && "opacity-60")}
    >
      <div className="flex items-center">
        <button
          id={`${id}-head`}
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={bodyId}
          className="flex min-h-16 min-w-0 flex-1 items-center gap-3 rounded-l-[1.25rem] py-3 pl-4 text-left"
        >
          <span
            aria-hidden="true"
            className={cx(
              "grid size-8 shrink-0 place-items-center rounded-full border text-[0.6875rem]",
              complete ? "border-accent/50 bg-accent/10 text-accent-fg" : current ? "border-accent text-accent-fg" : "border-line text-muted",
            )}
          >
            {complete ? <Check className="size-4" /> : done > 0 && <span className="num">{done}</span>}
          </span>
          <span className="min-w-0 flex-1">
            <span className={cx("block truncate text-[0.9375rem]", ex.skipped && "line-through decoration-muted")} title={ex.exerciseName}>
              {ex.exerciseName}
            </span>
            <span className="num block text-[0.6875rem] text-muted">
              {ex.skipped ? "Skipped" : `${done}/${total} sets`}
              {!ex.skipped && ex.restSeconds !== null && ex.restSeconds > 0 && ` · rest ${fmtClock(ex.restSeconds)}`}
            </span>
          </span>
          <ChevronDown className={cx("size-4 shrink-0 text-muted transition-transform", open && "rotate-180")} aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={onOptions}
          aria-label={`${ex.exerciseName} options`}
          className="mr-1.5 grid size-11 shrink-0 place-items-center rounded-xl text-muted hover:bg-surface-2 hover:text-ink"
        >
          <MoreHorizontal className="size-5" aria-hidden="true" />
        </button>
      </div>

      {open && (
        <div id={bodyId} className="px-3 pb-3 sm:px-4 sm:pb-4">
          {(ex.tempo || ex.notes) && (
            <div className="mb-3 space-y-1 px-1 text-[0.75rem] leading-relaxed text-muted">
              {ex.tempo && (
                <p>
                  Tempo <span className="num text-ink">{ex.tempo}</span>
                </p>
              )}
              {ex.notes && <p className="whitespace-pre-line">{ex.notes}</p>}
            </div>
          )}
          <div className={cx("grid gap-2 px-1 pb-1.5 text-[0.625rem] tracking-[0.06em] text-muted uppercase", grid(cols.length))} aria-hidden="true">
            <span className="text-center">Set</span>
            {cols.map((c) => (
              <span key={c.label} className="text-center">
                {c.label}
              </span>
            ))}
            <span />
          </div>
          <ol className="space-y-1.5">
            {ex.sets.map((x) => {
              const label = x.isWarmup ? "W" : String(++working);
              const name = x.isWarmup ? "warm-up set" : `set ${label}`;
              const server = serverErrors[x.id] ?? {};
              const fieldError = (c: Col) => bad[`${x.id}:${c.field}`] ?? server[c.field];
              // Client errors first, then server ones (including fields this row has no input for).
              const messages = [
                ...cols.map((c) => bad[`${x.id}:${c.field}`]),
                ...Object.values(server),
                blocked[x.id],
              ].filter((m, i, all): m is string => !!m && all.indexOf(m) === i);
              const errId = `${id}-${x.id}-err`;
              return (
                <li key={x.id} className={cx("grid items-center gap-2 rounded-xl p-1 transition-colors", grid(cols.length), x.done && "bg-accent/8")}>
                  <button
                    type="button"
                    onClick={() => onSetOptions(x, name)}
                    aria-label={`${ex.exerciseName} ${name} options`}
                    className={cx(
                      "stat grid h-12 place-items-center rounded-xl text-[0.8125rem] hover:bg-surface-2 sm:h-11",
                      x.isWarmup ? "text-warning" : "text-muted",
                    )}
                  >
                    {label}
                  </button>
                  {cols.map((c) => {
                    const t = c.target?.(x);
                    const err = fieldError(c);
                    return (
                      <NumField
                        key={c.label}
                        aria-label={`${ex.exerciseName} ${name} ${c.label}`}
                        placeholder={t === null || t === undefined ? "–" : String(t)}
                        value={c.get(x)}
                        decimal={c.decimal}
                        invalid={!!err}
                        describedBy={err ? errId : undefined}
                        onText={(text) => onText(x, c, text)}
                      />
                    );
                  })}
                  <button
                    type="button"
                    aria-pressed={x.done}
                    aria-label={`${x.done ? "Undo" : "Complete"} ${ex.exerciseName} ${name}`}
                    aria-describedby={blocked[x.id] ? errId : undefined}
                    onClick={() => tryCheck(x)}
                    className={cx(
                      "grid size-12 place-items-center rounded-xl border transition-colors sm:size-11",
                      x.done
                        ? "border-accent/50 bg-accent/10 text-accent-fg"
                        : "border-line bg-surface-2/60 text-muted hover:border-accent/50 hover:text-ink",
                    )}
                  >
                    <Check className="size-5" aria-hidden="true" />
                  </button>
                  {messages.length > 0 && (
                    <p id={errId} aria-live="polite" className="col-span-full px-1 text-[0.75rem] leading-snug text-danger">
                      {messages.join(" ")}
                    </p>
                  )}
                </li>
              );
            })}
          </ol>
          <button
            type="button"
            onClick={() => dispatch({ type: "addSet", exId: ex.id })}
            className="mt-2 flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-line text-[0.8125rem] text-muted hover:border-accent/40 hover:text-ink"
          >
            <Plus className="size-4" aria-hidden="true" />
            Add Set
          </button>
        </div>
      )}
    </section>
  );
}
