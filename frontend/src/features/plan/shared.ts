import { useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { AlertTriangle, Check, Circle, Moon, SkipForward, type LucideIcon } from "lucide-react";
import { api, ApiError, errorMessage } from "../../lib/api";
import type { PlanEntry, Template } from "../../lib/types";
import { isMissed } from "./calendar";

export const templatesQuery = { queryKey: ["templates"], queryFn: () => api.get<Template[]>("/api/templates") };

/** POST /api/sessions and go to the live session. 409 = one is already running: open that one. */
export function useStartSession() {
  const navigate = useNavigate();
  const [pending, setPending] = useState<string | null>(null);
  const start = async (body: { templateId?: string; planEntryId?: string }) => {
    setPending(body.planEntryId ?? body.templateId ?? "");
    try {
      await api.post("/api/sessions", { planEntryId: body.planEntryId ?? null, templateId: body.templateId ?? null, name: null });
      navigate("/workouts/session");
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        toast.info("You already have a workout in progress.");
        navigate("/workouts/session");
      } else toast.error(errorMessage(e));
    } finally {
      setPending(null);
    }
  };
  return { start, pending };
}

export type Tone = "planned" | "done" | "skipped" | "missed" | "rest";

export function entryTone(e: PlanEntry, todayIso: string): Tone {
  if (e.status === "Completed") return "done";
  if (e.status === "Skipped") return "skipped";
  if (e.kind === "RestDay") return "rest";
  return isMissed(e, todayIso) ? "missed" : "planned";
}

export const toneLabel: Record<Tone, string> = { planned: "Planned", done: "Completed", skipped: "Skipped", missed: "Missed", rest: "Rest day" };

/** Every status has an icon and a label, never colour alone: tick done, circle planned, skip-arrow skipped, warning missed, moon rest. */
export const toneIcon: Record<Tone, LucideIcon> = { planned: Circle, done: Check, skipped: SkipForward, missed: AlertTriangle, rest: Moon };
export const toneIconClass: Record<Tone, string> = {
  planned: "text-info",
  done: "text-success",
  skipped: "text-muted",
  missed: "text-warning",
  rest: "text-muted",
};

/** Chip colours: planned = info, done = success, skipped = muted, missed = warning, rest = calm neutral. */
export const toneClass: Record<Tone, string> = {
  planned: "border-info/40 bg-info/10 text-ink",
  done: "border-success/35 bg-success/10 text-ink",
  skipped: "border-line bg-transparent text-muted",
  missed: "border-warning/40 bg-warning/5 text-ink",
  rest: "border-line bg-surface-2/60 text-muted",
};

/** Rename API field paths the form knows under another name, so applyFieldErrors can place them. */
export function renameFieldErrors(err: unknown, map: (key: string) => string) {
  if (!(err instanceof ApiError)) return;
  err.fieldErrors = Object.fromEntries(Object.entries(err.fieldErrors).map(([k, v]) => [map(k), v]));
}
