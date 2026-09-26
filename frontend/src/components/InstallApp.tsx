import { useEffect, useState } from "react";
import { Download, Share, SquarePlus, X } from "lucide-react";
import { Button } from "./ui";

/** Chrome/Edge/Android fire this before showing their own install UI; we keep it to trigger on demand. */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferred: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    notify();
  });
}

const isStandalone = () =>
  window.matchMedia?.("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
// iPhone/iPad Safari has no install prompt: people add it via Share → Add to Home Screen.
const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

export function useInstall() {
  const [, rerender] = useState(0);
  useEffect(() => {
    const l = () => rerender((n) => n + 1);
    listeners.add(l);
    return () => void listeners.delete(l);
  }, []);
  const installed = isStandalone();
  return {
    installed,
    /** Android/desktop Chromium: a one-tap native prompt is available. */
    canPrompt: !installed && deferred !== null,
    /** iOS: show the manual steps instead. */
    ios: !installed && isIos(),
    install: async () => {
      if (!deferred) return false;
      await deferred.prompt();
      const { outcome } = await deferred.userChoice;
      deferred = null;
      notify();
      return outcome === "accepted";
    },
  };
}

function IosSteps() {
  return (
    <ol className="space-y-1.5 text-sm text-muted">
      <li className="flex items-center gap-2">
        1. Tap <Share className="size-4 text-ink" aria-label="Share" /> in Safari’s toolbar
      </li>
      <li className="flex items-center gap-2">
        2. Choose <SquarePlus className="size-4 text-ink" aria-hidden="true" /> <span className="text-ink">Add to Home Screen</span>
      </li>
    </ol>
  );
}

/** Settings section body: install button, iOS steps, or "installed". */
export function InstallAppPanel() {
  const { installed, canPrompt, ios, install } = useInstall();
  if (installed) return <p className="text-sm text-muted">Fittrack is installed on this device.</p>;
  if (canPrompt)
    return (
      <Button onClick={() => void install()}>
        <Download className="size-4" aria-hidden="true" />
        Install Fittrack
      </Button>
    );
  if (ios) return <IosSteps />;
  return (
    <p className="text-sm text-muted">
      Open Fittrack in Chrome (Android) or Safari (iPhone) over HTTPS, then use the browser menu’s “Install app” or “Add to Home Screen”.
    </p>
  );
}

const DISMISS_KEY = "fittrack.install-dismissed";

/** One-time, dismissible nudge on phones that aren't running the installed app yet. */
export function InstallBanner() {
  const { canPrompt, ios, install } = useInstall();
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(DISMISS_KEY) === "1";
    } catch {
      return true;
    }
  });
  if (dismissed || !(canPrompt || ios)) return null;
  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // Storage blocked: hide for this visit only.
    }
    setDismissed(true);
  };
  return (
    <div role="region" aria-label="Install the app" className="mb-5 flex items-start gap-3 rounded-2xl border border-line bg-surface p-3.5 md:hidden">
      <img src="/icon-192.png" alt="" width={40} height={40} className="size-10 shrink-0 rounded-xl" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">Use Fittrack as an app</p>
        {canPrompt ? (
          <p className="text-xs text-muted">Full screen, home-screen icon, works offline for what you’ve viewed.</p>
        ) : (
          <div className="mt-1">
            <IosSteps />
          </div>
        )}
        {canPrompt && (
          <Button size="sm" className="mt-2" onClick={() => void install().then((ok) => ok && dismiss())}>
            <Download className="size-4" aria-hidden="true" />
            Install
          </Button>
        )}
      </div>
      <button type="button" onClick={dismiss} aria-label="Dismiss" className="-m-1 grid size-11 shrink-0 place-items-center rounded-lg text-muted hover:text-ink">
        <X className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}
