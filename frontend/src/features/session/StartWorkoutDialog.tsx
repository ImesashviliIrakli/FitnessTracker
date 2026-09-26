import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarCheck, ChevronRight, ClipboardList, Play } from "lucide-react";
import { api, ApiError, errorMessage } from "../../lib/api";
import { fmtWeekday, today } from "../../lib/format";
import type { PlanEntry, Session, StartSessionInput, Template } from "../../lib/types";
import { Button, cx, Dialog, Input, Skeleton } from "../../components/ui";

const heading = "mb-2 text-[0.6875rem] tracking-[0.08em] text-muted uppercase";
const row =
  "flex min-h-14 w-full items-center gap-3 rounded-2xl border border-line bg-surface-2/50 px-3.5 py-2.5 text-left transition-colors hover:border-accent/40 disabled:opacity-55";

/** Start sheet: next planned workout, a template, or an empty session. */
export function StartWorkoutDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState<string | null>(null);
  const [name, setName] = useState("");
  const next = useQuery({
    queryKey: ["plan", "next"],
    queryFn: () => api.get<{ entry: PlanEntry | null }>("/api/plan/next"),
    enabled: open,
  });
  const templates = useQuery({ queryKey: ["templates"], queryFn: () => api.get<Template[]>("/api/templates"), enabled: open });
  const workoutTemplates = (templates.data ?? []).filter((t) => t.kind !== "RestDay");

  async function start(key: string, input: StartSessionInput) {
    setBusy(key);
    try {
      await api.post<Session>("/api/sessions", input);
    } catch (e) {
      // 409: a session is already running; resume it instead of starting another.
      if (!(e instanceof ApiError && e.status === 409)) {
        toast.error(errorMessage(e));
        setBusy(null);
        return;
      }
      toast.info("You already have a workout in progress. Picking up where you left off.");
    }
    navigate("/workouts/session");
  }

  const entry = next.data?.entry;
  const onEmpty = (e: FormEvent) => {
    e.preventDefault();
    void start("empty", { planEntryId: null, templateId: null, name: name.trim() || null });
  };

  return (
    <Dialog open={open} onClose={onClose} title="Start Workout">
      <div className="space-y-6">
        {(next.isPending || entry) && (
          <section aria-label="Up next">
            <h3 className={heading}>Up next</h3>
            {next.isPending ? (
              <Skeleton className="h-16 rounded-2xl" />
            ) : (
              entry && (
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => start("plan", { planEntryId: entry.id, templateId: null, name: null })}
                  className={cx(row, "glass-accent min-h-16")}
                >
                  <CalendarCheck className="size-5 shrink-0 text-accent-fg" aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[0.9375rem]">{entry.templateName ?? "Planned workout"}</span>
                    <span className="block text-[0.6875rem] text-muted">{entry.date === today() ? "Planned for today" : fmtWeekday(entry.date)}</span>
                  </span>
                  <span className="flex h-10 shrink-0 items-center gap-1.5 rounded-xl bg-accent px-3 text-[0.8125rem] text-accent-ink">
                    <Play className="size-3.5" aria-hidden="true" />
                    {busy === "plan" ? "Starting…" : "Start"}
                  </span>
                </button>
              )
            )}
          </section>
        )}

        <section aria-label="From a template">
          <h3 className={heading}>From a template</h3>
          {templates.isPending ? (
            <Skeleton className="h-28 rounded-2xl" />
          ) : templates.isError ? (
            <p className="text-[0.8125rem] text-danger">Couldn’t load templates.</p>
          ) : workoutTemplates.length === 0 ? (
            <p className="text-[0.8125rem] leading-relaxed text-muted">
              No templates yet. Build one under{" "}
              <Link to="/workouts/plan?tab=templates" onClick={onClose} className="text-accent-fg underline underline-offset-4 hover:no-underline">
                Plan Workouts
              </Link>{" "}
              to start with sets and targets ready.
            </p>
          ) : (
            <ul className="max-h-[36dvh] space-y-2 overflow-y-auto overscroll-contain">
              {workoutTemplates.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => start(t.id, { planEntryId: null, templateId: t.id, name: null })}
                    className={row}
                  >
                    <ClipboardList className="size-5 shrink-0 text-muted" aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[0.875rem]">{t.name}</span>
                      <span className="num block text-[0.6875rem] text-muted">
                        {t.exercises.length} {t.exercises.length === 1 ? "exercise" : "exercises"} · {t.exercises.reduce((n, x) => n + x.sets, 0)} sets
                      </span>
                    </span>
                    {busy === t.id ? (
                      <span className="text-[0.75rem] text-muted">Starting…</span>
                    ) : (
                      <ChevronRight className="size-4 shrink-0 text-muted" aria-hidden="true" />
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <form onSubmit={onEmpty} aria-label="Empty session">
          <h3 className={heading}>Empty session</h3>
          <div className="flex gap-2">
            <Input
              aria-label="Workout name (optional)"
              placeholder="Name (optional)"
              autoComplete="off"
              maxLength={100}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="min-w-0 flex-1"
            />
            <Button type="submit" variant="secondary" loading={busy === "empty"} disabled={busy !== null && busy !== "empty"}>
              Start Empty
            </Button>
          </div>
        </form>
      </div>
    </Dialog>
  );
}
