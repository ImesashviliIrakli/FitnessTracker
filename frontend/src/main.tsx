import "./lib/validation";
import { StrictMode, type CSSProperties } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "react-router";
import { MotionConfig } from "motion/react";
import { toast, Toaster } from "sonner";
import { registerSW } from "virtual:pwa-register";
import { ApiError } from "./lib/api";
import { meKey } from "./lib/auth";
import { router } from "./router";
import { watchSystemTheme } from "./lib/theme";
import "./index.css";

/** Retry only what can succeed on a second try: network drops (status 0), timeouts, rate limits and 5xx. */
const shouldRetry = (count: number, err: unknown) => {
  if (count >= 2) return false;
  if (!(err instanceof ApiError)) return true;
  return err.status === 0 || err.status === 408 || err.status === 429 || err.status >= 500;
};

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Screens share keys (["workouts"], ["dashboard"], ["sessions","active"]), so navigating back within
      // 30 s reuses the cache instead of refetching on every mount.
      staleTime: 30_000,
      retry: shouldRetry,
      retryDelay: (attempt) => Math.min(800 * 2 ** attempt, 6_000), // 0.8 s, 1.6 s
    },
  },
});

// ponytail: every successful write refetches all active queries; the app is small enough that
// precise per-key invalidation isn't worth the bookkeeping. Revisit if screens get heavy.
window.addEventListener("data:changed", () => void queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] !== meKey[0] }));

window.addEventListener("auth:expired", () => queryClient.setQueryData(meKey, null));

// A new version waits until the user chooses to reload (never mid-set). Checks hourly while open.
const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    toast("A new version of Fittrack is ready", {
      duration: Infinity,
      action: { label: "Reload", onClick: () => void updateSW(true) },
    });
  },
  onRegisteredSW(_url, registration) {
    if (registration) setInterval(() => void registration.update(), 60 * 60 * 1000);
  },
});
watchSystemTheme();

/** Sonner reads these variables; point them at the app's surfaces and semantic colours (both themes). */
const tint = (c: string, pct: number) => `color-mix(in oklab, var(${c}) ${pct}%, var(--surface))`;
const toastTheme = {
  "--normal-bg": "var(--surface)",
  "--normal-border": "var(--line)",
  "--normal-text": "var(--ink)",
  "--normal-bg-hover": "var(--surface-2)",
  "--normal-border-hover": "var(--field-line)",
  ...Object.fromEntries(
    (["success", "info", "warning", "danger"] as const).flatMap((k) => {
      const name = k === "danger" ? "error" : k;
      return [
        [`--${name}-bg`, tint(`--${k}`, 12)],
        [`--${name}-border`, tint(`--${k}`, 45)],
        [`--${name}-text`, "var(--ink)"],
      ];
    }),
  ),
  fontFamily: "var(--font-sans)",
} as CSSProperties;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <MotionConfig reducedMotion="user">
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
        <Toaster position="top-center" richColors closeButton style={toastTheme} />
      </QueryClientProvider>
    </MotionConfig>
  </StrictMode>,
);
