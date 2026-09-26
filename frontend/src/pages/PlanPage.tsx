import { useRef, type KeyboardEvent } from "react";
import { useSearchParams } from "react-router";
import { PageHeader, cx } from "../components/ui";
import { PlanCalendar } from "../features/plan/PlanCalendar";
import { TemplatesTab } from "../features/plan/TemplatesTab";

const tabs = [
  { id: "plan", label: "Calendar" },
  { id: "templates", label: "Templates" },
] as const;
type Tab = (typeof tabs)[number]["id"];

export default function PlanPage() {
  const [params, setParams] = useSearchParams();
  const tab: Tab = params.get("tab") === "templates" ? "templates" : "plan";
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});

  const select = (id: Tab, focus = false) => {
    setParams((p) => (p.set("tab", id), p), { replace: true });
    if (focus) refs.current[id]?.focus();
  };
  // WAI-ARIA tabs: arrows / Home / End move between tabs.
  const onKey = (e: KeyboardEvent) => {
    const i = tabs.findIndex((t) => t.id === tab);
    const next = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    select(tabs[(next + tabs.length) % tabs.length]!.id, true);
  };

  return (
    <>
      <PageHeader title="Plan" description="Build templates, put them on your calendar, and see what you actually did." />
      <div role="tablist" aria-label="Plan sections" onKeyDown={onKey} className="mb-5 flex gap-1 border-b border-line">
        {tabs.map((t) => (
          <button
            key={t.id}
            ref={(el) => {
              refs.current[t.id] = el;
            }}
            type="button"
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`panel-${t.id}`}
            tabIndex={tab === t.id ? 0 : -1}
            onClick={() => select(t.id)}
            className={cx(
              "-mb-px min-h-11 border-b-2 px-4 text-[0.8125rem] transition-colors",
              tab === t.id ? "border-accent text-ink" : "border-transparent text-muted hover:text-ink",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === "plan" ? <PlanCalendar /> : <TemplatesTab />}
      </div>
    </>
  );
}
