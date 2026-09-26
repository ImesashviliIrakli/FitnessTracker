import { lazy, Suspense, type ReactNode } from "react";
import { createBrowserRouter, Navigate, Outlet, useLocation, useRouteError, type RouteObject } from "react-router";
import { AppShell } from "./components/AppShell";
import { ErrorState, Loading, NotFoundState } from "./components/ui";
import { useMe } from "./lib/auth";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";

const pages = {
  dashboard: () => import("./pages/DashboardPage"),
  onboarding: () => import("./pages/OnboardingPage"),
  body: () => import("./pages/BodyPage"),
  workouts: () => import("./pages/WorkoutsPage"),
  workoutEditor: () => import("./pages/WorkoutEditorPage"),
  session: () => import("./pages/SessionPage"),
  plan: () => import("./pages/PlanPage"),
  records: () => import("./pages/RecordsPage"),
  checkIn: () => import("./pages/CheckInPage"),
  calculator: () => import("./pages/CalculatorPage"),
  settings: () => import("./pages/SettingsPage"),
  more: () => import("./pages/MorePage"),
};
const DashboardPage = lazy(pages.dashboard);
const OnboardingPage = lazy(pages.onboarding);
const BodyPage = lazy(pages.body);
const WorkoutsPage = lazy(pages.workouts);
const WorkoutEditorPage = lazy(pages.workoutEditor);
const SessionPage = lazy(pages.session);
const PlanPage = lazy(pages.plan);
const RecordsPage = lazy(pages.records);
const CheckInPage = lazy(pages.checkIn);
const CalculatorPage = lazy(pages.calculator);
const SettingsPage = lazy(pages.settings);
const MorePage = lazy(pages.more);

// Fetch every route chunk as soon as the browser is idle (in parallel with /api/auth/me), so the first
// visit to a page never waits on a chunk download behind a spinner. Failures are ignored: lazy() retries.
const preloadPages = () => Object.values(pages).forEach((load) => void load().catch(() => {}));
if ("requestIdleCallback" in window) requestIdleCallback(preloadPages, { timeout: 2000 });
else setTimeout(preloadPages, 200);

function FullPage({ children }: { children: ReactNode }) {
  return <div className="mx-auto max-w-md px-4 py-16">{children}</div>;
}

function RequireAuth() {
  const me = useMe();
  const location = useLocation();
  if (me.isPending) return <FullPage><Loading /></FullPage>;
  // 5xx / offline on the first check: an error with Retry, never an endless skeleton. A failed *re*fetch
  // (data already cached) keeps the app usable.
  if (me.isError && me.data === undefined) return <FullPage><ErrorState error={me.error} onRetry={() => me.refetch()} /></FullPage>;
  if (!me.data) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  const onboarding = location.pathname === "/onboarding";
  if (!me.data.profileComplete && !onboarding) return <Navigate to="/onboarding" replace />;
  return (
    <Suspense fallback={<FullPage><Loading /></FullPage>}>
      <Outlet />
    </Suspense>
  );
}

function GuestOnly() {
  const me = useMe();
  if (me.isPending) return <FullPage><Loading /></FullPage>;
  return me.data ? <Navigate to="/" replace /> : <Outlet />;
}

/** Render/loader errors and failed chunk loads (e.g. after a deploy): offer a reload instead of a blank page. */
function RouteError() {
  const error = useRouteError();
  return (
    <FullPage>
      <ErrorState error={error instanceof Error ? error : new Error("Something went wrong loading this page.")} onRetry={() => window.location.reload()} />
    </FullPage>
  );
}

function NotFoundPage() {
  return <NotFoundState message="There’s no page at this address. It may have moved, or the link is mistyped." />;
}

export const routes: RouteObject[] = [
  {
    element: <GuestOnly />,
    children: [
      { path: "/login", element: <LoginPage /> },
      { path: "/register", element: <RegisterPage /> },
    ],
  },
  {
    element: <RequireAuth />,
    errorElement: <RouteError />,
    children: [
      { path: "/onboarding", element: <OnboardingPage /> },
      {
        element: <AppShell />,
        children: [
          { index: true, element: <DashboardPage /> },
          { path: "/workouts", element: <WorkoutsPage /> },
          { path: "/workouts/session", element: <SessionPage /> },
          { path: "/workouts/plan", element: <PlanPage /> },
          { path: "/workouts/log", element: <WorkoutEditorPage /> },
          { path: "/workouts/new", element: <Navigate to="/workouts/log" replace /> },
          { path: "/workouts/:id", element: <WorkoutEditorPage /> },
          { path: "/templates", element: <Navigate to="/workouts/plan?tab=templates" replace /> },
          { path: "/records", element: <RecordsPage /> },
          { path: "/body", element: <BodyPage /> },
          { path: "/check-in", element: <CheckInPage /> },
          { path: "/calculator", element: <CalculatorPage /> },
          { path: "/settings", element: <SettingsPage /> },
          { path: "/more", element: <MorePage /> },
          { path: "*", element: <NotFoundPage /> },
        ],
      },
    ],
  },
];

export const router = createBrowserRouter(routes);
