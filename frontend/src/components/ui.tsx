import {
  cloneElement,
  forwardRef,
  isValidElement,
  useEffect,
  useId,
  useRef,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactElement,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { Link } from "react-router";
import { AlertTriangle, ArrowLeft, Compass, Loader2, Pencil, Trash2, X } from "lucide-react";

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

/**
 * primary   filled accent: the ONE main action on a screen
 * secondary neutral outline (>= 3:1 boundary)
 * subtle    neutral tinted fill, no border: toolbar and tertiary actions
 * ghost     text only until hover
 * danger    filled danger, for confirmations
 */
export type ButtonVariant = "primary" | "secondary" | "subtle" | "ghost" | "danger";
type Variant = ButtonVariant;
export const buttonVariants: Record<Variant, string> = {
  primary: "bg-accent text-accent-ink hover:brightness-110 active:brightness-95",
  secondary: "border border-field-line bg-transparent text-ink hover:bg-surface-2",
  subtle: "bg-surface-2 text-ink hover:bg-line/60",
  ghost: "text-ink hover:bg-surface-2",
  danger: "bg-danger text-bg hover:brightness-110",
};
const variants = buttonVariants;
/** Button look for a <Link> (navigation styled as an action). */
export const buttonClass = (variant: Variant = "primary", size: "sm" | "md" = "md") =>
  cx(
    "inline-flex items-center justify-center gap-2 rounded-xl font-medium whitespace-nowrap transition-[background-color,filter,color] duration-150",
    size === "sm" ? "h-10 px-3.5 text-sm sm:h-9" : "h-12 px-5 text-[0.9375rem] sm:h-11",
    variants[variant],
  );

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md"; loading?: boolean }
>(function Button({ variant = "primary", size = "md", loading, className, children, disabled, type = "button", ...props }, ref) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cx(
        buttonClass(variant, size),
        "disabled:opacity-55 disabled:pointer-events-none",
        className,
      )}
      {...props}
    >
      {loading && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
      {children}
    </button>
  );
});

/** Default classes that a caller's own padding/height class replaces (Tailwind orders utilities by CSS, not class order). */
const unless = (className: string | undefined, re: RegExp, defaults: string) => (className && re.test(className) ? "" : defaults);
const padX = (c?: string) => unless(c, /(^|\s)(sm:)?(p|px)-/, "px-3.5");
const height = (c?: string) => unless(c, /(^|\s)(sm:)?h-/, "h-12 sm:h-11");

const control =
  "w-full rounded-xl border border-field-line bg-field text-base sm:text-[0.9375rem] placeholder:text-muted transition-colors hover:border-muted focus:border-accent-fg " +
  "aria-[invalid=true]:border-danger aria-[invalid=true]:focus:border-danger aria-[invalid=true]:focus-visible:outline-danger disabled:opacity-60";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...props },
  ref,
) {
  return <input ref={ref} className={cx(control, padX(className), height(className), "num", className)} {...props} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea(
  { className, ...props },
  ref,
) {
  return <textarea ref={ref} rows={3} className={cx(control, padX(className), "py-2 min-h-20", className)} {...props} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select(
  { className, ...props },
  ref,
) {
  return <select ref={ref} className={cx(control, padX(className), height(className), "select-chevron truncate pr-9", className)} {...props} />;
});

/** Label + control + hint + inline error, wired up with ids for assistive tech. */
export function Field({
  label,
  error,
  hint,
  className,
  children,
}: {
  label: ReactNode;
  error?: string;
  hint?: ReactNode;
  className?: string;
  children: ReactElement<Record<string, unknown>>;
}) {
  const id = useId();
  const describedBy = [hint && `${id}-hint`, error && `${id}-err`].filter(Boolean).join(" ") || undefined;
  const control = isValidElement(children)
    ? cloneElement(children, { id, "aria-invalid": error ? true : undefined, "aria-describedby": describedBy })
    : children;
  return (
    <div className={cx("flex flex-col gap-1.5 min-w-0", className)}>
      <label id={`${id}-label`} htmlFor={id} className="text-[0.8125rem] leading-snug font-medium">
        {label}
      </label>
      {control}
      {hint && !error && (
        <p id={`${id}-hint`} className="text-xs leading-snug text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-err`} className="text-xs leading-snug text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

export function Card({ className, children, ...props }: React.HTMLAttributes<HTMLElement>) {
  return (
    <section className={cx("rounded-[1.25rem] border border-line bg-surface p-4 sm:p-6", className)} {...props}>
      {children}
    </section>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <header className="mb-5 flex flex-wrap items-end justify-between gap-3 sm:mb-6">
      <div className="min-w-0">
        <h1 className="text-[1.5rem] leading-tight font-semibold tracking-[-0.025em] sm:text-[1.875rem]">{title}</h1>
        {description && <p className="mt-1 max-w-prose text-[0.8125rem] leading-relaxed text-muted sm:text-[0.9375rem]">{description}</p>}
      </div>
      {actions && <div className="flex w-full flex-wrap gap-2 sm:w-auto [&>*]:flex-1 sm:[&>*]:flex-none">{actions}</div>}
    </header>
  );
}

export function EmptyState({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-[1.25rem] border border-dashed border-line px-5 py-8 sm:items-center sm:text-center">
      {icon && <div className="text-muted" aria-hidden="true">{icon}</div>}
      <h2 className="text-base font-semibold sm:text-lg">{title}</h2>
      {children && <p className="max-w-md text-sm leading-relaxed text-muted">{children}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-wrap items-center gap-3 rounded-[1.25rem] border border-danger/40 bg-danger/5 p-4">
      <AlertTriangle className="size-5 shrink-0 text-danger" aria-hidden="true" />
      <p className="min-w-0 flex-1 text-sm">{error instanceof Error ? error.message : "Couldn’t load this data."}</p>
      {onRetry && (
        <Button size="sm" variant="secondary" onClick={onRetry}>
          Try Again
        </Button>
      )}
    </div>
  );
}

/** "This doesn't exist": for unknown routes and bad ids (e.g. a deleted workout). */
export function NotFoundState({
  title = "Page not found",
  message = "The link may be old, or the item was deleted.",
  backTo = "/",
  backLabel = "Back to Dashboard",
}: {
  title?: string;
  message?: ReactNode;
  backTo?: string;
  backLabel?: string;
}) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-[1.25rem] border border-line bg-surface px-5 py-8 sm:items-center sm:py-12 sm:text-center">
      <Compass className="size-7 text-muted" aria-hidden="true" />
      <h1 className="text-lg font-semibold sm:text-xl">{title}</h1>
      <p className="max-w-md text-sm leading-relaxed text-muted">{message}</p>
      <Link to={backTo} className={cx(buttonClass("secondary"), "mt-1")}>
        <ArrowLeft className="size-4" aria-hidden="true" />
        {backLabel}
      </Link>
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cx("animate-pulse rounded-lg bg-surface-2", className)} />;
}

export function Loading({ label = "Loading…" }: { label?: string }) {
  return (
    <div role="status" className="space-y-3">
      <span className="sr-only">{label}</span>
      <Skeleton className="h-24" />
      <Skeleton className="h-40" />
    </div>
  );
}

/** Native <dialog>: focus trapping, Esc and inert background come for free. */
export function Dialog({
  open,
  onClose,
  title,
  children,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal?.();
    if (!open && d.open) d.close?.();
  }, [open]);
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      // React bubbles a nested dialog's native `close` event to ancestor dialogs (e.g. the exercise picker
      // inside the template editor), which would close the parent too. Only react to our own dialog closing.
      onClose={(e) => e.target === e.currentTarget && onClose()}
      onClick={(e) => e.target === ref.current && onClose()}
      className={cx(
        // Phones: bottom sheet, capped height. Desktop: pinned 10vh from the top (not centred), so the dialog
        // grows downward when content changes (search results, errors) and click targets stay put.
        "max-sm:mx-0 max-sm:mt-auto max-sm:mb-0 max-sm:max-h-[85dvh] max-sm:w-full max-sm:max-w-none max-sm:rounded-b-none max-sm:border-x-0 max-sm:border-b-0 max-sm:pb-[env(safe-area-inset-bottom)]",
        "sm:mx-auto sm:mt-[10vh] sm:mb-auto sm:max-h-[80vh] sm:w-[calc(100%-2rem)]",
        "overflow-y-auto overscroll-contain rounded-3xl border border-line bg-surface p-0 text-ink shadow-2xl",
        wide ? "max-w-2xl" : "max-w-md",
      )}
    >
      {open && (
        <div className="p-5 pt-3 sm:p-6">
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line sm:hidden" aria-hidden="true" />
          <div className="mb-4 flex items-start justify-between gap-4">
            <h2 id={titleId} className="min-w-0 text-base leading-snug font-semibold sm:text-lg">
              {title}
            </h2>
            <button type="button" onClick={onClose} aria-label="Close" className="-m-2.5 shrink-0 rounded-lg p-2.5 text-muted hover:bg-surface-2 hover:text-ink">
              <X className="size-5" aria-hidden="true" />
            </button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}

/** Confirmation for destructive actions. */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  body,
  confirmLabel,
  loading,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  body: ReactNode;
  confirmLabel: string;
  loading?: boolean;
}) {
  return (
    <Dialog open={open} onClose={onClose} title={title}>
      <p className="text-sm leading-relaxed text-muted">{body}</p>
      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="danger" onClick={onConfirm} loading={loading}>
          {confirmLabel}
        </Button>
      </div>
    </Dialog>
  );
}

/** Segmented control built on radio inputs (keyboard + screen reader semantics for free). */
export function Segmented<T extends string>({
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
  const name = useId();
  return (
    <fieldset className="min-w-0">
      <legend className="sr-only">{label}</legend>
      <div className="inline-flex rounded-xl border border-line bg-surface-2 p-1">
        {options.map((o) => (
          <label
            key={o.value}
            className={cx(
              "grid min-h-10 cursor-pointer place-items-center rounded-lg border px-3 text-[0.8125rem] whitespace-nowrap transition-colors sm:min-h-8 sm:px-3.5 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent-fg",
              value === o.value ? "border-accent/60 bg-surface font-medium text-ink" : "border-transparent text-muted hover:text-ink",
            )}
          >
            <input type="radio" name={name} value={o.value} checked={value === o.value} onChange={() => onChange(o.value)} className="sr-only" />
            {o.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** Edit + delete icon buttons for a table row or card. */
export function RowActions({ label, onEdit, onDelete }: { label: string; onEdit: () => void; onDelete: () => void }) {
  return (
    <>
      <button type="button" onClick={onEdit} aria-label={`Edit ${label}`} className="inline-grid size-11 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-ink sm:size-9">
        <Pencil className="size-4" aria-hidden="true" />
      </button>
      <button type="button" onClick={onDelete} aria-label={`Delete ${label}`} className="inline-grid size-11 place-items-center rounded-lg text-muted hover:bg-danger/10 hover:text-danger sm:size-9">
        <Trash2 className="size-4" aria-hidden="true" />
      </button>
    </>
  );
}
