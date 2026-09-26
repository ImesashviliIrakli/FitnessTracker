import type { FieldValues, Path, UseFormSetError } from "react-hook-form";

// Vite inlines VITE_* at build time; the Docker image takes it as a build arg.
export const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL || "http://localhost:8080").replace(/\/+$/, "");

/** RFC 9457 ProblemDetails turned into something the UI can use. */
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    /** Keys are react-hook-form paths, e.g. `exercises.0.sets.1.reps`. */
    public fieldErrors: Record<string, string[]> = {},
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** `Exercises[0].Sets[1].Reps` → `exercises.0.sets.1.reps` */
export function toFieldPath(key: string): string {
  return key
    .replace(/\[(\d+)\]/g, ".$1")
    .split(".")
    .filter(Boolean)
    .map((s) => s.charAt(0).toLowerCase() + s.slice(1))
    .join(".");
}

export async function parseProblem(res: Response): Promise<ApiError> {
  let body: { title?: string; detail?: string; errors?: Record<string, string[]> } = {};
  try {
    body = await res.json();
  } catch {
    // Non-JSON error body (proxy error page etc.) — fall through to status text.
  }
  const fieldErrors: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(body.errors ?? {})) fieldErrors[toFieldPath(k)] = v;
  const message =
    body.detail ||
    body.title ||
    (res.status === 429 ? "Too many attempts. Wait a minute and try again." : `Request failed (${res.status}).`);
  return new ApiError(res.status, message, fieldErrors);
}

const unsafe = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (unsafe.has(method)) headers["X-CSRF"] = "1";

  let res: Response;
  try {
    res = await fetch(apiBaseUrl + path, {
      method,
      headers,
      credentials: "include",
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "Can’t reach the server. Check your connection and try again.");
  }

  if (res.status === 401 && !path.startsWith("/api/auth/")) {
    window.dispatchEvent(new Event("auth:expired"));
  }
  if (!res.ok) throw await parseProblem(res);
  // Every successful write outside auth/calculator changes user data; main.tsx refetches on this.
  // Live-session autosaves and set logs only touch the draft; finishing a session does change history.
  const draftWrite = (method === "PUT" && /^\/api\/sessions\/[^/]+$/.test(path)) || /^\/api\/sessions\/[^/]+\/log$/.test(path);
  if (unsafe.has(method) && !draftWrite && !/^\/api\/(auth|calculator)\//.test(path + "/")) window.dispatchEvent(new Event("data:changed"));
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body ?? {}),
  put: <T>(path: string, body: unknown) => request<T>("PUT", path, body),
  del: (path: string) => request<void>("DELETE", path),
};

/** Push server-side validation messages into a react-hook-form; returns true if any field matched. */
export function applyFieldErrors<T extends FieldValues>(err: unknown, setError: UseFormSetError<T>): boolean {
  if (!(err instanceof ApiError)) return false;
  let matched = false;
  for (const [field, messages] of Object.entries(err.fieldErrors)) {
    if (!field || !messages[0]) continue;
    setError(field as Path<T>, { type: "server", message: messages[0] }, { shouldFocus: !matched });
    matched = true;
  }
  return matched;
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Something went wrong. Try again.";
}

/** File downloads (export) go through fetch so the auth cookie and error handling apply. */
export async function download(path: string, fallbackName: string) {
  const res = await fetch(apiBaseUrl + path, { credentials: "include" });
  if (!res.ok) throw await parseProblem(res);
  const name = /filename="?([^";]+)"?/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? fallbackName;
  const url = URL.createObjectURL(await res.blob());
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  a.click();
  URL.revokeObjectURL(url);
}
