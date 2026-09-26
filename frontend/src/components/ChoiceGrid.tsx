import { useId, type ReactNode } from "react";
import { cx } from "./ui";

/** Radio group laid out as a grid, so long labels wrap on phones instead of overflowing like `Segmented`. */
export function ChoiceGrid<T extends string>({
  label,
  hint,
  value,
  onChange,
  options,
  className,
  grid = "grid-cols-2",
}: {
  label: string;
  hint?: ReactNode;
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  className?: string;
  /** Column classes for the grid. */
  grid?: string;
}) {
  const name = useId();
  return (
    <fieldset className={cx("min-w-0", className)}>
      <legend className="mb-1.5 text-[0.8125rem] leading-snug">{label}</legend>
      <div className={cx("grid gap-1 rounded-xl border border-line bg-surface-2 p-1", grid)}>
        {options.map((o) => (
          <label
            key={o.value}
            className={cx(
              "grid min-h-11 cursor-pointer place-items-center rounded-lg px-2 py-1 text-center text-[0.8125rem] leading-tight transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent-fg sm:min-h-9 sm:px-3.5",
              value === o.value ? "bg-surface font-semibold text-ink ring-1 ring-accent-fg/60 ring-inset" : "text-muted hover:text-ink",
            )}
          >
            <input type="radio" name={name} value={o.value} checked={value === o.value} onChange={() => onChange(o.value)} className="sr-only" />
            {o.label}
          </label>
        ))}
      </div>
      {hint && <p className="mt-1.5 text-xs leading-snug text-muted">{hint}</p>}
    </fieldset>
  );
}
