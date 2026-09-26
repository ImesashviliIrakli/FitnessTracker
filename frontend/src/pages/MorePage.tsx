import { Link } from "react-router";
import { ChevronRight, LogOut } from "lucide-react";
import { useLogout } from "../lib/auth";
import { nav } from "../components/AppShell";
import { PageHeader } from "../components/ui";

/** Mobile overflow menu for sections that don't fit the bottom bar. */
export default function MorePage() {
  const logout = useLogout();
  return (
    <>
      <PageHeader title="More" />
      <nav aria-label="More sections">
        <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
          {nav
            .filter((n) => !n.mobile)
            .map(({ to, label, icon: Icon }) => (
              <li key={to}>
                <Link to={to} className="flex min-h-14 items-center gap-3 px-4 py-3 text-[0.875rem] tracking-[-0.01em] hover:bg-surface-2">
                  <Icon className="size-5 shrink-0 text-muted" aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate">{label}</span>
                  <ChevronRight className="size-4 shrink-0 text-muted" aria-hidden="true" />
                </Link>
              </li>
            ))}
          <li>
            <button type="button" onClick={logout} className="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left text-[0.875rem] tracking-[-0.01em] hover:bg-surface-2">
              <LogOut className="size-5 shrink-0 text-muted" aria-hidden="true" />
              Log Out
            </button>
          </li>
        </ul>
      </nav>
    </>
  );
}
