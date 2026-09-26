import { useMemo, useState } from "react";
import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { Search, Trophy } from "lucide-react";
import { api } from "../lib/api";
import { useUnits } from "../lib/auth";
import { fmtDate, fmtNum } from "../lib/format";
import type { PersonalRecord } from "../lib/types";
import { Card, EmptyState, ErrorState, Input, Loading, PageHeader } from "../components/ui";

export default function RecordsPage() {
  const u = useUnits();
  const [search, setSearch] = useState("");
  const q = useQuery({ queryKey: ["records"], queryFn: () => api.get<PersonalRecord[]>("/api/records") });
  const rows = useMemo(() => {
    const s = search.trim().toLowerCase();
    return (q.data ?? []).filter((r) => !s || r.exerciseName.toLowerCase().includes(s));
  }, [q.data, search]);
  const w = (kg: number | null) => (kg === null ? "–" : `${fmtNum(u.toWeight(kg), 1)} ${u.weight}`);

  return (
    <>
      <PageHeader title="Personal Records" description="Your heaviest set and best estimated one-rep max for every lift. Warm-up sets don’t count." />
      {q.isPending ? (
        <Loading />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : q.data.length === 0 ? (
        <EmptyState
          icon={<Trophy className="size-6" />}
          title="No records yet"
          action={
            <Link to="/workouts" className="font-medium underline underline-offset-4 hover:text-accent-fg">
              Log a strength workout
            </Link>
          }
        >
          Log strength sets with weight and reps and your records fill in automatically.
        </EmptyState>
      ) : (
        <div className="space-y-4">
          <div className="relative max-w-sm">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden="true" />
            <Input type="search" aria-label="Filter records" placeholder="Filter by exercise…" autoComplete="off" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
          {/* A list rather than a table: on phones each lift becomes a small card (name on top, two figures below). */}
          <Card className="p-0!">
            <div className="hidden grid-cols-[minmax(0,1fr)_12rem_12rem] gap-4 border-b border-line px-5 py-3 text-sm text-muted sm:grid" aria-hidden="true">
              <span>Exercise</span>
              <span className="text-right">Heaviest</span>
              <span className="text-right">Best e1RM</span>
            </div>
            <ul className="divide-y divide-line" aria-label="Personal records by exercise">
              {rows.map((r) => (
                <li key={r.exerciseId} className="grid grid-cols-2 gap-x-4 gap-y-2 px-4 py-3.5 sm:grid-cols-[minmax(0,1fr)_12rem_12rem] sm:items-center sm:px-5">
                  <h2 className="col-span-2 text-[0.9375rem] leading-snug sm:col-span-1">{r.exerciseName}</h2>
                  <Figure
                    label="Heaviest"
                    value={r.bestWeightKg !== null && r.bestWeightReps ? `${w(r.bestWeightKg)} × ${r.bestWeightReps}` : w(r.bestWeightKg)}
                    date={r.bestWeightDate}
                  />
                  <Figure label="Best e1RM" value={w(r.best1Rm)} date={r.best1RmDate} />
                </li>
              ))}
              {rows.length === 0 && <li className="px-4 py-6 text-center text-muted">No exercise matches “{search}”.</li>}
            </ul>
          </Card>
        </div>
      )}
    </>
  );
}

function Figure({ label, value, date }: { label: string; value: string; date: string | null }) {
  return (
    <dl className="min-w-0 sm:text-right">
      <dt className="text-[0.6875rem] tracking-[-0.02em] text-muted sm:sr-only">{label}</dt>
      <dd className="stat text-base whitespace-nowrap">{value}</dd>
      {date && <dd className="text-xs tracking-[-0.02em] text-muted">{fmtDate(date)}</dd>}
    </dl>
  );
}
