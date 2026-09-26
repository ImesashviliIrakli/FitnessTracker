import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, ApiError } from "../../lib/api";
import type { FinishSessionInput, Session, SessionSummary } from "../../lib/types";
import { isSetAction, reduce, toInput, toLog, type Action } from "./session";

export const activeSessionKey = ["sessions", "active"] as const;
const getActive = async () => (await api.get<Session | undefined>("/api/sessions/active")) ?? null;

const retryable = (e: unknown) => !(e instanceof ApiError) || e.status === 0 || e.status >= 500;
/** Transient failures (network, 5xx) get two more tries: after 0.5 s, then 1 s. */
const MAX_RETRIES = 2;
const backoff = (attempt: number) => 500 * 2 ** attempt;

/** For the Workouts landing: the in-progress session, or null. */
export function useActiveSession() {
  return useQuery({
    queryKey: activeSessionKey,
    queryFn: getActive,
    retry: (n, e) => retryable(e) && n < MAX_RETRIES,
    retryDelay: backoff,
  });
}

/** Date.now(), re-rendered every second while `on`. */
export function useNow(on = true) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!on) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [on]);
  return now;
}

// Unsynced local edits survive a reload or a dead connection; cleared once the server has them.
const BACKUP = "fittrack.session-draft";
function readBackup(): Session | null {
  try {
    return JSON.parse(localStorage.getItem(BACKUP) ?? "null");
  } catch {
    return null;
  }
}
function writeBackup(s: Session | null) {
  try {
    if (s) localStorage.setItem(BACKUP, JSON.stringify(s));
    else localStorage.removeItem(BACKUP);
  } catch {
    // Storage blocked (private mode): the server copy is all we have.
  }
}

export type SyncStatus = "saved" | "saving" | "offline" | "error";
/** Server validation messages by set id, then by set field (`reps`, `weightKg`, …). */
export type FieldErrors = Record<string, Record<string, string>>;
const AUTOSAVE_MS = 800;
const RETRY_MS = 5000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** ProblemDetails `errors` of a rejected write, mapped onto the sets they belong to. */
function toFieldErrors(e: unknown, sent: Session, loggedSetId: string | null): FieldErrors | null {
  if (!(e instanceof ApiError) || e.status !== 400) return null;
  const out: FieldErrors = {};
  for (const [path, [msg]] of Object.entries(e.fieldErrors)) {
    if (!msg) continue;
    let setId: string | null | undefined = loggedSetId;
    let field = path;
    if (!loggedSetId) {
      // PUT paths look like `exercises.0.sets.1.reps`.
      const m = /^exercises\.(\d+)\.sets\.(\d+)\.(\w+)$/.exec(path);
      setId = m ? sent.exercises[+m[1]!]?.sets[+m[2]!]?.id : undefined;
      field = m?.[3] ?? path;
    }
    if (setId) (out[setId] ??= {})[field] = msg;
  }
  return Object.keys(out).length ? out : null;
}

/**
 * The live session as optimistic local state. Set checks/edits are sent with `POST /log`,
 * structural edits with a debounced `PUT` (a full replace, so it also carries every set).
 * Writes run one at a time, in order; failures are kept dirty and retried.
 */
export function useSessionDraft() {
  const [session, setSession] = useState<Session | null | undefined>(undefined); // undefined = loading
  const [loadError, setLoadError] = useState<unknown>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [status, setStatus] = useState<SyncStatus>("saved");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const ref = useRef<Session | null>(null);
  const dirty = useRef({ structure: false, sets: new Map<string, [string, string]>() });
  const chain = useRef<Promise<void>>(Promise.resolve());
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const mounted = useRef(true);

  const isDirty = () => dirty.current.structure || dirty.current.sets.size > 0;
  /** Drop server messages for one set (or all): the value they were about is gone. */
  const clearErrors = (setId?: string) =>
    setFieldErrors((f) => {
      if (setId === undefined) return Object.keys(f).length ? {} : f;
      if (!(setId in f)) return f;
      const { [setId]: _, ...rest } = f;
      return rest;
    });

  const flushOnce = useCallback(async () => {
    const s = ref.current;
    if (!s || !isDirty()) return;
    const { structure, sets } = dirty.current;
    dirty.current = { structure: false, sets: new Map() };
    setStatus("saving");
    let logging: string | null = null;
    try {
      if (structure) {
        await api.put<Session>(`/api/sessions/${s.id}`, toInput(s));
        clearErrors();
      } else
        for (const [exId, setId] of sets.values()) {
          logging = setId;
          const x = ref.current?.exercises.find((e) => e.id === exId)?.sets.find((y) => y.id === setId);
          if (x) await api.post<Session>(`/api/sessions/${s.id}/log`, toLog(exId, x));
          clearErrors(setId);
        }
      if (!isDirty()) {
        setStatus("saved");
        writeBackup(null);
      }
    } catch (e) {
      dirty.current.structure ||= structure;
      for (const [k, v] of sets) if (!dirty.current.sets.has(k)) dirty.current.sets.set(k, v);
      if (retryable(e)) {
        setStatus("offline");
        clearTimeout(timer.current);
        if (mounted.current) timer.current = setTimeout(() => void flush().catch(() => {}), RETRY_MS);
      } else {
        setStatus("error");
        const errs = toFieldErrors(e, s, structure ? null : logging);
        if (errs) setFieldErrors((f) => ({ ...f, ...errs }));
      }
      throw e;
    }
  }, []); // `flush` (below) is stable and only read when a retry fires.

  const flush = useCallback(() => {
    clearTimeout(timer.current);
    const next = chain.current.then(flushOnce);
    chain.current = next.catch(() => {});
    return next;
  }, [flushOnce]);

  const quietFlush = useCallback(() => void flush().catch(() => {}), [flush]);

  // Load: server copy, unless this device has newer unsynced edits for the same session.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let server: Session | null = null;
      for (let attempt = 0; ; attempt++) {
        try {
          server = await getActive();
          break;
        } catch (e) {
          if (cancelled) return;
          if (retryable(e) && attempt < MAX_RETRIES) {
            await sleep(backoff(attempt));
            if (cancelled) return;
            continue;
          }
          const b = readBackup();
          if (!b) return setLoadError(e);
          ref.current = b;
          dirty.current.structure = true;
          setSession(b);
          setStatus("offline");
          timer.current = setTimeout(quietFlush, RETRY_MS);
          return;
        }
      }
      if (cancelled) return;
      const b = readBackup();
      if (server && b?.id === server.id) {
        ref.current = b;
        dirty.current.structure = true;
        setSession(b);
        quietFlush();
      } else {
        if (b) writeBackup(null);
        ref.current = server;
        setSession(server);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [quietFlush, loadAttempt]);

  /** After a failed load: try again without reloading the page. */
  const retryLoad = useCallback(() => {
    setLoadError(null);
    setLoadAttempt((n) => n + 1);
  }, []);

  // Push pending edits when the connection returns, the tab is hidden, or the page is left.
  useEffect(() => {
    mounted.current = true;
    const onHide = () => document.visibilityState === "hidden" && quietFlush();
    window.addEventListener("online", quietFlush);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("online", quietFlush);
      document.removeEventListener("visibilitychange", onHide);
      mounted.current = false; // one last attempt; the local backup covers a failure
      quietFlush();
    };
  }, [quietFlush]);

  const dispatch = useCallback(
    (a: Action) => {
      const cur = ref.current;
      if (!cur) return;
      const next = reduce(cur, a);
      ref.current = next;
      setSession(next);
      if (isSetAction(a)) {
        dirty.current.sets.set(`${a.exId}:${a.setId}`, [a.exId, a.setId]);
        clearErrors(a.setId);
      } else dirty.current.structure = true;
      writeBackup(next);
      if (a.type === "toggleSet") quietFlush();
      else {
        clearTimeout(timer.current);
        timer.current = setTimeout(quietFlush, AUTOSAVE_MS);
      }
    },
    [quietFlush],
  );

  const finish = useCallback(
    async (input: FinishSessionInput) => {
      const s = ref.current!;
      await flush();
      const summary = await api.post<SessionSummary>(`/api/sessions/${s.id}/finish`, input);
      writeBackup(null);
      return summary;
    },
    [flush],
  );

  const discard = useCallback(async () => {
    const s = ref.current!;
    clearTimeout(timer.current);
    await api.del(`/api/sessions/${s.id}`);
    dirty.current = { structure: false, sets: new Map() };
    writeBackup(null);
  }, []);

  return { session, loadError, retryLoad, status, fieldErrors, dispatch, finish, discard };
}
