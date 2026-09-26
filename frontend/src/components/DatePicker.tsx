import { forwardRef, useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { useController, type Control, type FieldValues, type Path } from "react-hook-form";
import { addDays, addMonths, addYears, endOfMonth, isSameDay, isSameMonth, parseISO, setMonth, setYear, startOfDay, startOfMonth, startOfWeek } from "date-fns";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { Button, cx, Field } from "./ui";
import { toIsoDate } from "../lib/format";

const WEEK = { weekStartsOn: 1 } as const; // ISO weeks, same as streaks and weekly charts
const triggerFmt = new Intl.DateTimeFormat(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" });
const dayLabelFmt = new Intl.DateTimeFormat(undefined, { dateStyle: "full" });
const monthYearFmt = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" });
const monthNames = Array.from({ length: 12 }, (_, m) => new Intl.DateTimeFormat(undefined, { month: "long" }).format(new Date(2000, m, 1)));
const weekdays = Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(new Date(2024, 0, 1), WEEK), i)).map((d) => ({
  short: new Intl.DateTimeFormat(undefined, { weekday: "short" }).format(d).slice(0, 2),
  long: new Intl.DateTimeFormat(undefined, { weekday: "long" }).format(d),
}));
const supportsPopover = typeof HTMLElement !== "undefined" && typeof HTMLElement.prototype.showPopover === "function";

export type DatePickerProps = {
  /** Field passes `id`; the picker names itself from the Field label (`${id}-label`) plus its value. */
  id?: string;
  name?: string;
  /** `YYYY-MM-DD`, or empty for no date. */
  value: string | null | undefined;
  onChange: (value: string) => void;
  onBlur?: () => void;
  min?: string;
  max?: string;
  /** Required pickers have no Clear action. */
  required?: boolean;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
};

/**
 * Button + calendar popover. The native Popover API gives top-layer rendering (works inside <dialog>),
 * Esc and light dismiss. Desktop: anchored to the trigger. Phones: a bottom sheet.
 * Keyboard: arrows move by day/week, PageUp/PageDown by month (Shift: year), Home/End to week start/end.
 */
export const DatePicker = forwardRef<HTMLButtonElement, DatePickerProps>(function DatePicker(
  { id, name, value, onChange, onBlur, min, max, required, placeholder = "Pick a date", disabled, className, ...aria },
  ref,
) {
  const popId = useId();
  const headingId = useId();
  const valueId = useId();
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const focusDay = useRef(false);
  const [open, setOpen] = useState(false);

  const selected = value ? parseISO(value) : null;
  const minD = min ? parseISO(min) : null;
  const maxD = max ? parseISO(max) : null;
  const inRange = (d: Date) => !(minD && d < minD) && !(maxD && d > maxD);
  const clamp = (d: Date) => startOfDay(minD && d < minD ? minD : maxD && d > maxD ? maxD : d);
  const [focused, setFocused] = useState(() => clamp(selected ?? new Date()));

  const setRefs = (el: HTMLButtonElement | null) => {
    triggerRef.current = el;
    if (typeof ref === "function") ref(el);
    else if (ref) ref.current = el;
  };

  const place = useCallback(() => {
    const t = triggerRef.current;
    const p = popRef.current;
    if (!t || !p) return;
    if (window.matchMedia?.("(max-width: 639px)").matches) {
      p.style.top = p.style.left = ""; // bottom sheet via CSS
      return;
    }
    const r = t.getBoundingClientRect();
    const gap = 6;
    const fitsBelow = r.bottom + gap + p.offsetHeight <= window.innerHeight - 8;
    const top = fitsBelow || r.top - gap - p.offsetHeight < 8 ? r.bottom + gap : r.top - gap - p.offsetHeight;
    p.style.top = `${top}px`;
    p.style.left = `${Math.min(Math.max(8, r.left), window.innerWidth - p.offsetWidth - 8)}px`;
  }, []);

  const opening = () => {
    setFocused(clamp(selected ?? new Date()));
    focusDay.current = true;
    setOpen(true);
  };

  const close = () => {
    try {
      popRef.current?.hidePopover();
    } catch {
      /* not open, or no Popover API */
    }
    setOpen(false);
    triggerRef.current?.focus();
  };

  // Browser-driven open/close (popovertarget, Esc, light dismiss) keeps React state in sync.
  useEffect(() => {
    const p = popRef.current;
    if (!p || !supportsPopover) return;
    const onBeforeToggle = (e: Event) => {
      if ((e as ToggleEvent).newState === "open") opening();
    };
    const onToggle = (e: Event) => {
      if ((e as ToggleEvent).newState === "open") {
        // Only now is the popover visible: measure it for placement and move focus into the grid.
        place();
        p.querySelector<HTMLButtonElement>('[data-date][tabindex="0"]')?.focus();
        return;
      }
      setOpen(false);
      const active = document.activeElement;
      if (!active || active === document.body || p.contains(active)) triggerRef.current?.focus();
    };
    p.addEventListener("beforetoggle", onBeforeToggle);
    p.addEventListener("toggle", onToggle);
    return () => {
      p.removeEventListener("beforetoggle", onBeforeToggle);
      p.removeEventListener("toggle", onToggle);
    };
  });

  useLayoutEffect(() => {
    if (!open) return;
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, place]);

  // Keyboard moves focus with the highlighted day; the month/year selects keep their own focus.
  useEffect(() => {
    if (!open || !focusDay.current) return;
    popRef.current?.querySelector<HTMLButtonElement>(`[data-date="${toIsoDate(focused)}"]`)?.focus();
  }, [open, focused]);

  const move = (d: Date, fromKeyboard: boolean) => {
    focusDay.current = fromKeyboard;
    setFocused(clamp(d));
  };

  const pick = (d: Date) => {
    onChange(toIsoDate(d));
    close();
  };

  const onGridKey = (e: KeyboardEvent) => {
    const step: Record<string, (d: Date) => Date> = {
      ArrowLeft: (d) => addDays(d, -1),
      ArrowRight: (d) => addDays(d, 1),
      ArrowUp: (d) => addDays(d, -7),
      ArrowDown: (d) => addDays(d, 7),
      Home: (d) => startOfWeek(d, WEEK),
      End: (d) => addDays(startOfWeek(d, WEEK), 6),
      PageUp: (d) => (e.shiftKey ? addYears(d, -1) : addMonths(d, -1)),
      PageDown: (d) => (e.shiftKey ? addYears(d, 1) : addMonths(d, 1)),
    };
    const f = step[e.key];
    if (!f) return;
    e.preventDefault();
    move(f(focused), true);
  };

  const view = startOfMonth(focused);
  const gridStart = startOfWeek(view, WEEK);
  // Always six rows so the popover never changes height between months.
  const weeks = Array.from({ length: 6 }, (_, w) => Array.from({ length: 7 }, (_, d) => addDays(gridStart, w * 7 + d)));
  const thisYear = new Date().getFullYear();
  const firstYear = Math.min(minD?.getFullYear() ?? thisYear - 100, focused.getFullYear());
  const lastYear = Math.max(maxD?.getFullYear() ?? thisYear + 10, focused.getFullYear());
  const monthOutOfRange = (m: Date) => (maxD && m > maxD) || (minD && endOfMonth(m) < minD);
  const now = startOfDay(new Date());

  return (
    <>
      <button
        ref={setRefs}
        id={id}
        name={name}
        type="button"
        disabled={disabled}
        popoverTarget={supportsPopover ? popId : undefined}
        onClick={supportsPopover ? undefined : () => (open ? close() : opening())}
        onBlur={onBlur}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-labelledby={id ? `${id}-label ${valueId}` : undefined}
        {...aria}
        className={cx(
          "flex h-12 w-full items-center gap-2 rounded-xl border border-field-line bg-field px-3.5 text-left text-base sm:h-11 sm:text-[0.9375rem]",
          "transition-colors hover:border-muted aria-expanded:border-accent-fg aria-[invalid=true]:border-danger disabled:opacity-60",
          className,
        )}
      >
        <CalendarDays className="size-4 shrink-0 text-muted" aria-hidden="true" />
        <span id={valueId} className={cx("min-w-0 truncate num", !selected && "text-muted/80")}>
          {selected ? triggerFmt.format(selected) : placeholder}
        </span>
      </button>

      <div
        ref={popRef}
        id={popId}
        popover={supportsPopover ? "auto" : undefined}
        role="dialog"
        aria-labelledby={headingId}
        onKeyDown={(e) => {
          if (!supportsPopover && e.key === "Escape") close();
        }}
        className={cx(
          "fixed z-50 m-0 w-[20.5rem] rounded-2xl border border-line bg-surface p-3 text-ink shadow-2xl shadow-black/40 sm:inset-auto",
          "max-sm:inset-x-0 max-sm:top-auto max-sm:bottom-0 max-sm:w-full max-sm:max-w-none max-sm:rounded-b-none max-sm:border-x-0 max-sm:border-b-0",
          "max-sm:px-4 max-sm:pt-4 max-sm:pb-[max(1rem,env(safe-area-inset-bottom))]",
          "backdrop:bg-transparent max-sm:backdrop:bg-black/40",
          "motion-safe:transition-[opacity,translate] motion-safe:duration-150 motion-safe:starting:translate-y-1 motion-safe:starting:opacity-0",
          !supportsPopover && !open && "hidden",
        )}
      >
        {open && (
          <>
            <h2 id={headingId} className="sr-only" aria-live="polite">
              {monthYearFmt.format(view)}
            </h2>
            <div className="flex items-center gap-1">
              <select
                aria-label="Month"
                value={view.getMonth()}
                onChange={(e) => move(setMonth(focused, Number(e.target.value)), false)}
                className="select-chevron h-10 min-w-0 flex-1 truncate rounded-lg border border-field-line bg-field pr-8 pl-2 text-base sm:h-9 sm:text-sm"
              >
                {monthNames.map((m, i) => (
                  <option key={m} value={i} disabled={!!monthOutOfRange(setMonth(view, i))}>
                    {m}
                  </option>
                ))}
              </select>
              <select
                aria-label="Year"
                value={view.getFullYear()}
                onChange={(e) => move(setYear(focused, Number(e.target.value)), false)}
                className="select-chevron h-10 w-[5.75rem] shrink-0 rounded-lg border border-field-line bg-field pr-7 pl-2 text-base num [background-position:right_0.4rem_center] sm:h-9 sm:w-[5.25rem] sm:text-sm"
              >
                {Array.from({ length: lastYear - firstYear + 1 }, (_, i) => firstYear + i).map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
              <NavButton label="Previous month" disabled={!!monthOutOfRange(addMonths(view, -1))} onClick={() => move(addMonths(focused, -1), false)}>
                <ChevronLeft className="size-4" aria-hidden="true" />
              </NavButton>
              <NavButton label="Next month" disabled={!!monthOutOfRange(addMonths(view, 1))} onClick={() => move(addMonths(focused, 1), false)}>
                <ChevronRight className="size-4" aria-hidden="true" />
              </NavButton>
            </div>

            <table role="grid" aria-labelledby={headingId} onKeyDown={onGridKey} className="mt-2 w-full border-collapse">
              <thead>
                <tr>
                  {weekdays.map((d) => (
                    <th key={d.long} scope="col" abbr={d.long} className="pb-1 text-center text-[0.6875rem] font-normal text-muted">
                      {d.short}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {weeks.map((week, w) => (
                  <tr key={w}>
                    {week.map((d) => {
                      const isSelected = !!selected && isSameDay(d, selected);
                      const isToday = isSameDay(d, now);
                      return (
                        <td key={toIsoDate(d)} aria-selected={isSelected} className="p-0.5 text-center">
                          <button
                            type="button"
                            data-date={toIsoDate(d)}
                            tabIndex={isSameDay(d, focused) ? 0 : -1}
                            disabled={!inRange(d)}
                            aria-label={dayLabelFmt.format(d)}
                            aria-current={isToday ? "date" : undefined}
                            onClick={() => pick(d)}
                            className={cx(
                              "relative mx-auto grid h-10 w-full max-w-10 place-items-center rounded-lg text-[0.8125rem] num max-sm:h-11 max-sm:max-w-12",
                              "transition-colors disabled:pointer-events-none disabled:opacity-30",
                              isSelected
                                ? "bg-accent font-semibold text-accent-ink"
                                : cx("hover:bg-surface-2", isSameMonth(d, view) ? "text-ink" : "text-muted/70"),
                              isToday && !isSelected && "font-semibold text-accent-fg after:absolute after:bottom-1 after:size-1 after:rounded-full after:bg-accent",
                            )}
                          >
                            {d.getDate()}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="mt-2 flex items-center justify-between gap-2 border-t border-line pt-3">
              {!required && selected ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    onChange("");
                    close();
                  }}
                >
                  Clear
                </Button>
              ) : (
                <span />
              )}
              <Button variant="secondary" size="sm" disabled={!inRange(now)} onClick={() => pick(now)}>
                Today
              </Button>
            </div>
          </>
        )}
      </div>
    </>
  );
});

function NavButton({ label, disabled, onClick, children }: { label: string; disabled: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="grid size-10 shrink-0 place-items-center rounded-lg sm:size-9 text-muted transition-colors hover:bg-surface-2 hover:text-ink disabled:opacity-30"
    >
      {children}
    </button>
  );
}

/** DatePicker bound to react-hook-form, wrapped in the standard Field (label, hint, error). */
export function DateField<T extends FieldValues>({
  control,
  name,
  label,
  error,
  hint,
  className,
  ...picker
}: {
  control: Control<T>;
  name: Path<T>;
  label: ReactNode;
  error?: string;
  hint?: ReactNode;
  className?: string;
} & Omit<DatePickerProps, "id" | "name" | "value" | "onChange" | "onBlur">) {
  const { field } = useController({ control, name });
  return (
    <Field label={label} error={error} hint={hint} className={className}>
      <DatePicker {...picker} ref={field.ref} name={field.name} value={field.value} onChange={field.onChange} onBlur={field.onBlur} />
    </Field>
  );
}
