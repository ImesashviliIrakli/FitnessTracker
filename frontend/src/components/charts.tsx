import { Bar, BarChart, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Scatter, Tooltip, XAxis, YAxis } from "recharts";
import { fmtNum, fmtShortDate, toIsoDate } from "../lib/format";
import type { Units } from "../lib/units";

// Keeps volume ticks (e.g. 12k) inside the narrow axis.
const compactNumber = new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 });

const axis = { stroke: "var(--line)", tick: { fill: "var(--muted)", fontSize: 11 }, tickLine: false } as const;
const tooltipStyle = {
  contentStyle: { background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 8, color: "var(--ink)" },
  labelStyle: { color: "var(--muted)" },
} as const;

/**
 * Whole-number y ticks (about `count` of them) that cover `values`, so labels never repeat
 * (a 2 kg range used to print 120, 120, 119, 119, 118). Returns the matching domain.
 */
export function intTicks(values: number[], count = 5): { domain: [number, number]; ticks: number[] } {
  const finite = values.filter(Number.isFinite);
  if (!finite.length) return { domain: [0, 1], ticks: [0, 1] };
  let lo = Math.floor(Math.min(...finite));
  let hi = Math.ceil(Math.max(...finite));
  if (hi - lo < 2) (lo -= 1), (hi += 1);
  const step = Math.max(1, Math.ceil((hi - lo) / (count - 1)));
  lo = Math.floor(lo / step) * step;
  hi = Math.ceil(hi / step) * step;
  const ticks = Array.from({ length: Math.round((hi - lo) / step) + 1 }, (_, i) => lo + i * step);
  return { domain: [lo, hi], ticks };
}

/** "── Trend 84.1 kg  ● Last weigh-in 84.4 kg": says which line is which, and which number is the smoothed one. */
export function TrendLegend({ trend, logged, unit, target }: { trend?: number | null; logged?: number | null; unit: string; target?: number | null }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 px-2 text-xs text-muted">
      {trend != null && (
        <li className="flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded-full bg-chart-1" aria-hidden="true" />
          Trend <span className="num text-ink">{fmtNum(trend, 1)} {unit}</span>
        </li>
      )}
      {logged != null && (
        <li className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-muted" aria-hidden="true" />
          Last weigh-in <span className="num text-ink">{fmtNum(logged, 1)} {unit}</span>
        </li>
      )}
      {target != null && (
        <li className="flex items-center gap-1.5">
          <span className="w-4 border-t-2 border-dashed border-success" aria-hidden="true" />
          Target <span className="num text-ink">{fmtNum(target, 1)} {unit}</span>
        </li>
      )}
    </ul>
  );
}

/** Daily weigh-ins as dots, smoothed trend as the line: the trend is what matters, not day-to-day noise. */
export function WeightChart({
  data,
  u,
  target,
  height = 260,
}: {
  data: { date: string; weightKg: number; trendKg?: number | null }[];
  u: Units;
  target?: number | null;
  height?: number;
}) {
  const rows = data.map((d) => ({
    t: new Date(d.date + "T00:00:00").getTime(),
    date: d.date,
    weight: u.toWeight(d.weightKg),
    trend: d.trendKg == null ? undefined : u.toWeight(d.trendKg),
  }));
  const values = rows.flatMap((r) => [r.weight, r.trend ?? r.weight]);
  if (target != null) values.push(u.toWeight(target));
  const { domain, ticks } = intTicks(values);
  const first = rows[0];
  const last = rows.at(-1);
  const summary =
    first && last
      ? `Weight from ${fmtShortDate(first.date)} to ${fmtShortDate(last.date)}: ${fmtNum(first.weight, 1)} to ${fmtNum(last.weight, 1)} ${u.weight}${last.trend != null ? `, trend ${fmtNum(last.trend, 1)} ${u.weight}` : ""}.`
      : "No weight data.";

  return (
    <div className="space-y-2">
      <div role="img" aria-label={summary} style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
            <CartesianGrid stroke="var(--line)" strokeDasharray="2 4" vertical={false} />
            <XAxis
              dataKey="t"
              type="number"
              scale="time"
              domain={["dataMin", "dataMax"]}
              tickFormatter={(t: number) => fmtShortDate(toIsoDate(new Date(t)))}
              {...axis}
            />
            <YAxis domain={domain} ticks={ticks} allowDecimals={false} width={48} tickFormatter={(v: number) => fmtNum(v)} {...axis} />
            <Tooltip
              {...tooltipStyle}
              labelFormatter={(t) => fmtShortDate(toIsoDate(new Date(Number(t))))}
              formatter={(v, name) => [`${fmtNum(Number(v), 1)} ${u.weight}`, name === "trend" ? "Trend" : name === "target" ? "Target" : "Weigh-in"]}
            />
            <Scatter dataKey="weight" fill="var(--muted)" fillOpacity={0.7} isAnimationActive={false} />
            <Line dataKey="trend" stroke="var(--chart-1)" strokeWidth={2.5} dot={false} type="monotone" isAnimationActive={false} connectNulls />
            {target != null && (
              <Line
                dataKey={() => u.toWeight(target)}
                name="target"
                stroke="var(--success)"
                strokeDasharray="6 4"
                strokeWidth={1.5}
                dot={false}
                isAnimationActive={false}
                legendType="none"
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <TrendLegend trend={last?.trend} logged={last?.weight} unit={u.weight} target={target != null ? u.toWeight(target) : null} />
    </div>
  );
}

export function WeeklyBars({
  data,
  dataKey,
  label,
  format,
  height = 160,
}: {
  data: { weekStart: string; workouts: number; volumeKg: number }[];
  dataKey: "workouts" | "volumeKg";
  label: string;
  format: (v: number) => string;
  height?: number;
}) {
  return (
    <div role="img" aria-label={`${label} for the last ${data.length} weeks.`} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 0, bottom: 0, left: -24 }}>
          <XAxis dataKey="weekStart" tickFormatter={fmtShortDate} interval="preserveStartEnd" {...axis} />
          <YAxis allowDecimals={false} width={48} tickFormatter={(v: number) => compactNumber.format(v)} {...axis} />
          <Tooltip
            {...tooltipStyle}
            cursor={{ fill: "var(--surface-2)" }}
            labelFormatter={(w) => `Week of ${fmtShortDate(String(w))}`}
            formatter={(v) => [format(Number(v)), label]}
          />
          <Bar dataKey={dataKey} fill="var(--chart-1)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
