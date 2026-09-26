export type Theme = "light" | "dark" | "system";

const media = () => window.matchMedia("(prefers-color-scheme: dark)");

export function getTheme(): Theme {
  try {
    const t = localStorage.getItem("theme");
    // Nothing stored yet: the dark design is the default.
    return t === "light" || t === "dark" || t === "system" ? t : "dark";
  } catch {
    return "dark";
  }
}

export function applyTheme(t: Theme) {
  const dark = t === "dark" || (t === "system" && media().matches);
  document.documentElement.classList.toggle("dark", dark);
}

export function setTheme(t: Theme) {
  try {
    localStorage.setItem("theme", t);
  } catch {
    // Storage blocked — the choice still applies for this session.
  }
  applyTheme(t);
}

/** Follow OS changes while the preference is "system". */
export function watchSystemTheme() {
  media().addEventListener("change", () => getTheme() === "system" && applyTheme("system"));
}
