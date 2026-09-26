import { Suspense, useId, useState } from "react";
import { Link, Outlet, useLocation } from "react-router";
import {
  Calculator,
  ChevronDown,
  CalendarDays,
  Dumbbell,
  HeartPulse,
  LayoutGrid,
  LogOut,
  Menu,
  Plus,
  Scale,
  Settings,
  Trophy,
  type LucideIcon,
} from "lucide-react";
import { useLogout, useMe } from "../lib/auth";
import { WeightDialog } from "./WeightDialog";
import { cx, Loading } from "./ui";

export const nav: { to: string; label: string; short?: string; icon: LucideIcon; mobile?: boolean }[] = [
  { to: "/", label: "Dashboard", short: "Home", icon: LayoutGrid, mobile: true },
  { to: "/workouts", label: "Workouts", icon: Dumbbell, mobile: true },
  { to: "/body", label: "Body", icon: Scale, mobile: true },
  { to: "/check-in", label: "Check-in", icon: HeartPulse, mobile: true },
  { to: "/records", label: "Records", icon: Trophy },
  { to: "/workouts/plan", label: "Plan", icon: CalendarDays },
  { to: "/calculator", label: "Calorie Target", icon: Calculator },
  { to: "/settings", label: "Settings", icon: Settings },
];

const matches = (path: string, to: string) => (to === "/" ? path === "/" : path === to || path.startsWith(to + "/"));

/** The one nav item for a path: the longest matching prefix, so /workouts/plan is Plan (not also Workouts). */
export function activeNav(pathname: string): string | null {
  return nav.filter((n) => matches(pathname, n.to)).sort((a, b) => b.to.length - a.to.length)[0]?.to ?? null;
}

/** Bottom bar: sections without their own tab (Records, Plan, Calculator, Settings, /more itself) light up More. */
export function activeMobileNav(pathname: string): string | null {
  if (matches(pathname, "/more")) return "/more";
  const to = activeNav(pathname);
  if (!to) return null;
  return nav.find((n) => n.to === to)!.mobile ? to : "/more";
}

const titles: Record<string, string> = {
  "/workouts": "Workouts",
  "/workouts/session": "Live Workout",
  "/workouts/plan": "Plan",
  "/workouts/log": "Log Workout",
  "/records": "Records",
  "/body": "Body",
  "/check-in": "Check-in",
  "/calculator": "Calorie Target",
  "/settings": "Settings",
  "/more": "More",
  "/onboarding": "Welcome",
};

/** Header title for every page except the dashboard (which greets instead). */
export function pageTitle(pathname: string): string {
  const path = pathname.replace(/\/+$/, "") || "/";
  return titles[path] ?? (path.startsWith("/workouts/") ? "Workout" : "Page Not Found");
}

/**
 * The spiral mark. /logo-mark.png is a white-on-transparent mask, painted with currentColor,
 * so the logo follows the surrounding text colour and the theme.
 */
const logoMask = { maskImage: "url(/logo-mark.png)", WebkitMaskImage: "url(/logo-mark.png)" } as const;
export function LogoMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cx("inline-block shrink-0 bg-current [mask-position:center] [mask-repeat:no-repeat] [mask-size:contain]", className)}
      style={logoMask}
    />
  );
}

export function Logo() {
  return (
    <span className="flex items-center gap-2 text-lg font-bold tracking-tight">
      <LogoMark className="size-7 text-accent-fg" />
      <span className="font-display tracking-[0.18em] uppercase">Fittrack</span>
    </span>
  );
}

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good Morning" : h < 18 ? "Good Afternoon" : "Good Evening";
}

function Initials({ name }: { name?: string }) {
  const letters = (name ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
  return (
    <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-full border border-line bg-surface-2 text-sm font-semibold text-ink">
      {letters || "·"}
    </span>
  );
}

/** Avatar + name; opens a small menu under the top bar (native popover: Esc and click-outside for free). */
function UserMenu() {
  const me = useMe().data;
  const logout = useLogout();
  const menuId = useId();
  const close = () => document.getElementById(menuId)?.hidePopover?.();
  return (
    <>
      <button
        type="button"
        popoverTarget={menuId}
        className="flex items-center gap-3 rounded-full py-1 pr-1 pl-1 transition-colors hover:bg-surface-2 lg:pr-3"
        aria-label={`Account menu for ${me?.displayName ?? "you"}`}
      >
        <Initials name={me?.displayName} />
        <span className="hidden max-w-40 truncate text-sm tracking-[-0.02em] lg:block">{me?.displayName}</span>
        <ChevronDown className="hidden size-4 text-muted lg:block" aria-hidden="true" />
      </button>
      <div
        id={menuId}
        popover="auto"
        className="fixed inset-auto top-[4.75rem] right-3 m-0 w-60 rounded-2xl border border-line bg-surface p-2 text-ink shadow-2xl shadow-black/40 md:top-[6.25rem] md:right-10"
      >
        <div className="px-3 py-2">
          <p className="truncate text-sm tracking-[-0.02em]">{me?.displayName}</p>
          <p className="truncate text-xs text-muted">{me?.email}</p>
        </div>
        <div className="my-1 h-px bg-line" />
        <Link to="/settings" onClick={close} className="flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-[0.8125rem] hover:bg-surface-2">
          <Settings className="size-4 text-muted" aria-hidden="true" />
          Settings
        </Link>
        <button type="button" onClick={logout} className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[0.8125rem] hover:bg-surface-2">
          <LogOut className="size-4 text-muted" aria-hidden="true" />
          Log Out
        </button>
      </div>
    </>
  );
}

function RailTip({ label }: { label: string }) {
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute left-full z-50 ml-3 rounded-lg border border-line bg-surface px-2.5 py-1 text-xs whitespace-nowrap text-ink opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
    >
      {label}
    </span>
  );
}

export function AppShell() {
  const me = useMe().data;
  const logout = useLogout();
  const [weighIn, setWeighIn] = useState(false);
  const { pathname } = useLocation();
  const onDashboard = pathname === "/";
  const current = activeNav(pathname);
  const currentMobile = activeMobileNav(pathname);
  const firstName = me?.displayName?.split(" ")[0];

  return (
    <div className="min-h-dvh bg-bg md:grid md:grid-cols-[5.5rem_1fr] md:grid-rows-[auto_1fr] md:bg-shell">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-xl focus:bg-accent focus:px-4 focus:py-2 focus:text-accent-ink"
      >
        Skip to Content
      </a>

      {/* Icon rail */}
      <aside className="sticky top-0 hidden h-dvh flex-col items-center py-7 md:row-span-2 md:flex">
        <Link to="/" aria-label="Fittrack home" className="text-ink/80 transition-colors hover:text-accent-fg">
          <LogoMark className="size-9" />
        </Link>
        <nav aria-label="Main" className="mt-12 flex flex-1 flex-col items-center gap-2.5">
          {nav.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              aria-current={current === to ? "page" : undefined}
              className={cx(
                "group relative grid size-12 place-items-center rounded-2xl transition-colors",
                current === to
                  ? "bg-surface-2 text-ink before:absolute before:-left-[1.125rem] before:h-5 before:w-1 before:rounded-full before:bg-accent"
                  : "text-muted hover:bg-surface-2 hover:text-ink",
              )}
            >
              <Icon className="size-5" aria-hidden="true" />
              <span className="sr-only">{label}</span>
              <RailTip label={label} />
            </Link>
          ))}
        </nav>
        <button
          type="button"
          onClick={logout}
          className="group relative grid size-12 place-items-center rounded-2xl text-muted transition-colors hover:bg-surface-2 hover:text-ink"
        >
          <LogOut className="size-5" aria-hidden="true" />
          <span className="sr-only">Log Out</span>
          <RailTip label="Log Out" />
        </button>
      </aside>

      {/* Top bar */}
      <header className="sticky top-0 z-30 flex min-w-0 items-center justify-between gap-3 border-b border-line/70 bg-bg/80 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 backdrop-blur-xl md:static md:border-0 md:bg-transparent md:px-10 md:py-7 md:backdrop-blur-none">
        <div className="flex min-w-0 items-center gap-3">
          <Link to="/" aria-label="Fittrack home" className="text-accent-fg md:hidden">
            <LogoMark className="size-7" />
          </Link>
          {onDashboard ? (
            <div className="min-w-0">
              <p className="truncate text-xs text-muted md:text-sm">{greeting()}</p>
              <p className="truncate text-base leading-tight font-semibold tracking-[-0.02em] md:text-xl lg:text-[1.625rem]">
                Welcome back{firstName ? `, ${firstName}` : ""}
              </p>
            </div>
          ) : (
            <p className="min-w-0 truncate text-base leading-tight font-semibold tracking-[-0.02em] md:text-xl" aria-hidden="true">
              {pageTitle(pathname)}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          {/* The Body page has its own Log Weight action. */}
          {pathname !== "/body" && (
            <button
              type="button"
              onClick={() => setWeighIn(true)}
              className="hidden h-11 items-center gap-2 rounded-full px-4 text-[0.8125rem] font-medium whitespace-nowrap text-muted transition-colors hover:bg-surface-2 hover:text-ink sm:flex"
            >
              <Scale className="size-4" aria-hidden="true" />
              Log Weight
            </button>
          )}
          <Link
            to="/workouts"
            className="flex size-11 items-center justify-center gap-2 rounded-full border border-field-line text-[0.8125rem] font-medium whitespace-nowrap text-ink transition-colors hover:bg-surface-2 sm:w-auto sm:px-4"
          >
            <Plus className="size-4" aria-hidden="true" />
            <span className="hidden sm:inline">Log Workout</span>
            <span className="sr-only sm:hidden">Log Workout</span>
          </Link>
          <UserMenu />
        </div>
      </header>

      <main
        id="main"
        tabIndex={-1}
        className="aurora min-w-0 bg-bg px-4 pt-5 pb-[calc(6.5rem+env(safe-area-inset-bottom))] focus:outline-none sm:px-6 md:rounded-tl-[2rem] md:border-t md:border-l md:border-line md:px-10 md:pt-10 md:pb-16"
      >
        <div className="mx-auto max-w-[90rem]">
          <Suspense fallback={<Loading />}>
            <Outlet />
          </Suspense>
        </div>
      </main>

      <WeightDialog open={weighIn} onClose={() => setWeighIn(false)} />

      <nav
        aria-label="Main"
        className="fixed inset-x-2 bottom-2 z-40 grid grid-cols-5 gap-0.5 rounded-[1.75rem] border border-line bg-shell/85 p-1 min-[400px]:inset-x-3 min-[400px]:bottom-3 min-[400px]:gap-1 min-[400px]:p-1.5 shadow-2xl shadow-black/50 backdrop-blur-xl md:hidden"
        style={{ marginBottom: "env(safe-area-inset-bottom)" }}
      >
        {[...nav.filter((n) => n.mobile), { to: "/more", label: "More", short: undefined, icon: Menu }].map(({ to, label, short, icon: Icon }) => (
          <Link
            key={to}
            to={to}
            aria-current={currentMobile === to ? "page" : undefined}
            className={cx(
              "relative flex min-h-14 min-w-0 flex-col items-center justify-center gap-1.5 rounded-[1.25rem] px-0.5 text-[0.6875rem] leading-none whitespace-nowrap transition-colors min-[400px]:text-xs",
              currentMobile === to
                ? "bg-surface-2 font-medium text-ink before:absolute before:top-1 before:h-0.5 before:w-5 before:rounded-full before:bg-accent"
                : "text-muted active:bg-surface-2",
            )}
          >
            <Icon className="size-5" aria-hidden="true" />
            <span aria-hidden={short ? true : undefined}>{short ?? label}</span>
            {short && <span className="sr-only">{label}</span>}
          </Link>
        ))}
      </nav>
    </div>
  );
}
