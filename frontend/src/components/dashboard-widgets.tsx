import { useId, type ReactNode } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChevronDown } from "lucide-react";
import { motion } from "motion/react";
import { cx } from "./ui";
import { fmtNum, fmtShortDate } from "../lib/format";
import { intTicks, TrendLegend } from "./charts";

/** Section title + optional control on the right ("Activity · Vs. weekly target ⌄"). */
export function Section({
  title,
  action,
  className,
  children,
}: {
  title: string;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <section aria-labelledby={id} className={cx("min-w-0", className)}>
      <header className="mb-3 flex min-h-9 items-center justify-between gap-3 sm:mb-4">
        <h2 id={id} className="min-w-0 truncate text-base tracking-[-0.02em] sm:text-lg">
          {title}
        </h2>
        {action}
      </header>
      {children}
    </section>
  );
}

/** Quiet glass panel that holds a chart or list. */
export function Panel({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cx("rounded-[1.25rem] border border-line bg-surface/80 p-4 sm:p-5", className)}>{children}</div>;
}

/** Inline select styled as a quiet text control. */
export function MiniSelect<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <label className="relative flex shrink-0 items-center text-[0.8125rem] whitespace-nowrap text-muted hover:text-ink">
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="min-h-9 cursor-pointer appearance-none rounded-lg bg-transparent py-1.5 pr-6 pl-2 text-right text-inherit focus-visible:outline-2"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} className="bg-surface text-ink">
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-0 size-4" aria-hidden="true" />
    </label>
  );
}

/** Capsule bars: dark tracks, quiet fills, the current column lit in the accent. */
export function CapsuleBars({
  items,
  summary,
}: {
  items: { key: string; label: string; pct: number; caption: string; current?: boolean; hideOnPhone?: boolean }[];
  summary: string;
}) {
  return (
    <div role="img" aria-label={summary} className="flex items-end justify-between gap-2 sm:gap-3">
      {items.map((it, i) => {
        // 0–100% maps to 14–76% of the track so the caption always fits inside the capsule, above the fill.
        const fill = 14 + (Math.min(100, Math.max(0, it.pct)) / 100) * 62;
        return (
          <div key={it.key} className={cx("flex min-w-0 flex-1 flex-col items-center gap-2", it.hideOnPhone && "max-sm:hidden")}>
            <div className={cx("relative h-40 w-full max-w-14 rounded-full border bg-bg sm:h-44", it.current ? "border-accent/40" : "border-line")}>
              <motion.div
                className={cx("absolute inset-x-1 bottom-1 rounded-full", it.current ? "glow bg-accent" : "bg-muted/20")}
                initial={{ height: 0 }}
                animate={{ height: `calc(${fill}% - 0.5rem)` }}
                transition={{ type: "spring", stiffness: 140, damping: 18, delay: i * 0.06 }}
              />
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.25 + i * 0.06 }}
                className={cx(
                  "stat absolute inset-x-0 text-center text-[0.625rem] tracking-[-0.04em] whitespace-nowrap sm:text-[0.6875rem] xl:text-[0.625rem]",
                  it.current ? "text-accent-fg" : "text-muted",
                )}
                style={{ bottom: `calc(${fill}% + 0.25rem)` }}
              >
                {it.caption}
              </motion.span>
            </div>
            {/* Month over day ("Aug / 24"): one short word per line never collides with its neighbour. */}
            <span className={cx("flex flex-col items-center text-[0.625rem] leading-tight tracking-[-0.02em] whitespace-nowrap sm:text-[0.6875rem]", it.current ? "text-ink" : "text-muted")}>
              {it.label.split(" ").map((part, i) => (
                <span key={i}>{part}</span>
              ))}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** Progress ring: a glowing comet arc on a quiet track. */
export function Ring({ pct, children, size = 168 }: { pct: number; children: ReactNode; size?: number }) {
  const gid = useId();
  const stroke = 12;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.min(100, Math.max(0, pct));
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true" className="-rotate-90">
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.25} />
            <stop offset="100%" stopColor="var(--accent)" />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-2)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r - stroke / 2 - 6} fill="none" stroke="var(--line)" strokeWidth={1} strokeDasharray="2 5" />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={`url(#${gid})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          initial={{ strokeDasharray: `0 ${c}` }}
          animate={{ strokeDasharray: `${(clamped / 100) * c} ${c}` }}
          transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1], delay: 0.15 }}
          style={{ filter: "drop-shadow(0 0 6px rgb(var(--glow) / 0.55))" }}
        />
      </svg>
      <div className="absolute inset-[26px] grid place-items-center rounded-full text-center">{children}</div>
    </div>
  );
}

/** Tiny trend line for summary cards; the last point is marked. */
export function Sparkline({ values, className }: { values: number[]; className?: string }) {
  if (values.length < 2) return null;
  const w = 160;
  const h = 44;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => [(i / (values.length - 1)) * (w - 8) + 4, h - 6 - ((v - min) / span) * (h - 14)] as const);
  const d = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const [lx, ly] = pts[pts.length - 1]!;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className={cx("w-full", className)} aria-hidden="true" preserveAspectRatio="none">
      <path d={`${d} L${lx},${h} L4,${h} Z`} fill="currentColor" opacity={0.1} />
      <path d={d} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      <circle cx={lx} cy={ly} r={3.5} fill="var(--bg)" stroke="currentColor" strokeWidth={2} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export type BadgeTone = "neutral" | "success" | "warning" | "danger" | "info";
const badgeTone: Record<BadgeTone, string> = {
  neutral: "border-line bg-surface-2 text-muted",
  success: "border-success/40 bg-success/10 text-success",
  warning: "border-warning/40 bg-warning/10 text-warning",
  danger: "border-danger/40 bg-danger/10 text-danger",
  info: "border-info/40 bg-info/10 text-info",
};

/** Small chip ("Target hit"): neutral by default, semantic when it reports a state. Pair with an icon. */
export function Badge({ icon, tone = "neutral", children }: { icon?: ReactNode; tone?: BadgeTone; children: ReactNode }) {
  return (
    <span className={cx("inline-flex max-w-full items-center gap-1.5 rounded-full border px-2 py-1 text-[0.6875rem] leading-none font-medium whitespace-nowrap [&>svg]:shrink-0", badgeTone[tone])}>
      {icon}
      {children}
    </span>
  );
}

export type Tone = "accent" | "plain";
const toneBg: Record<Tone, string> = {
  accent: "glass-accent border",
  plain: "border border-line bg-gradient-to-b from-surface-2 to-surface",
};
const toneRing: Record<Tone, string> = { accent: "border-accent/25", plain: "border-line" };

/** Glass card: accent-tinted for the highlighted item in a group, neutral otherwise. */
export function ColorCard({ tone, className, children }: { tone: Tone; className?: string; children: ReactNode }) {
  return <div className={cx("rounded-[1.25rem] text-ink", toneBg[tone], className)}>{children}</div>;
}

/** Glass card inside a thin dashed outline, echoing the design's offset frames. */
export function OutlinedColorCard({ tone, className, children }: { tone: Tone; className?: string; children: ReactNode }) {
  return (
    <div className={cx("rounded-[1.5rem] border border-dashed p-1", toneRing[tone])}>
      <ColorCard tone={tone} className={className}>
        {children}
      </ColorCard>
    </div>
  );
}

/** Smoothed-trend area chart with the latest trend value marked; `logged` = the last actual weigh-in, shown in the legend. */
export function GlowLineChart({ data, unit, logged, height = 230 }: { data: { date: string; value: number }[]; unit: string; logged?: number | null; height?: number }) {
  const gid = useId();
  const { domain, ticks } = intTicks(data.map((d) => d.value), 4);
  const first = data[0];
  const last = data.at(-1);
  const summary =
    first && last
      ? `Weight trend from ${fmtShortDate(first.date)} to ${fmtShortDate(last.date)}: ${fmtNum(first.value, 1)} to ${fmtNum(last.value, 1)} ${unit}${logged != null ? `. Last weigh-in ${fmtNum(logged, 1)} ${unit}` : ""}.`
      : "No data.";

  return (
    <div className="space-y-2">
      <div role="img" aria-label={summary} style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 34, right: 18, bottom: 0, left: -14 }}>
            <defs>
              <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.28} />
                <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="var(--line)" strokeDasharray="2 6" />
            <XAxis
              dataKey="date"
              tickFormatter={fmtShortDate}
              interval="preserveStartEnd"
              minTickGap={28}
              tick={{ fill: "var(--muted)", fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              dy={8}
            />
            <YAxis
              domain={domain}
              ticks={ticks}
              allowDecimals={false}
              width={44}
              tick={{ fill: "var(--muted)", fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v: number) => fmtNum(v)}
            />
            <Tooltip
              cursor={{ stroke: "var(--accent-fg)", strokeOpacity: 0.4, strokeDasharray: "3 4" }}
              contentStyle={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 12, color: "var(--ink)" }}
              labelStyle={{ color: "var(--muted)" }}
              labelFormatter={(d) => fmtShortDate(String(d))}
              formatter={(v) => [`${fmtNum(Number(v), 1)} ${unit}`, "Trend"]}
            />
            <Area
              dataKey="value"
              type="monotone"
              stroke="var(--accent-fg)"
              strokeWidth={2}
              fill={`url(#${gid})`}
              isAnimationActive={false}
              activeDot={{ r: 5, fill: "var(--accent)", stroke: "var(--surface)", strokeWidth: 2 }}
              dot={(props: { cx?: number; cy?: number; index?: number }) => {
                const { cx: x, cy: y, index } = props;
                if (index !== data.length - 1 || x == null || y == null || !last) return <g key={`d${index}`} />;
                return (
                  <g key="last">
                    <circle cx={x} cy={y} r={16} fill="var(--accent)" opacity={0.12} />
                    <circle cx={x} cy={y} r={7} fill="var(--accent)" style={{ filter: "drop-shadow(0 0 8px rgb(var(--glow)))" }} />
                    <circle cx={x} cy={y} r={2.5} fill="var(--bg)" />
                    <text x={x} y={y - 22} textAnchor="end" fill="var(--ink)" fontSize={12} fontWeight={600} style={{ fontVariantNumeric: "tabular-nums" }}>
                      {`Trend ${fmtNum(last.value, 1)} ${unit}`}
                    </text>
                  </g>
                );
              }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <TrendLegend trend={last?.value} logged={logged} unit={unit} />
    </div>
  );
}
