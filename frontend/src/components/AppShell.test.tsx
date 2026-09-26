import { describe, expect, it } from "vitest";
import { activeMobileNav, activeNav, pageTitle } from "./AppShell";

describe("nav active state", () => {
  it("highlights exactly one sidebar item: Plan for /workouts/plan, Workouts for other /workouts/*", () => {
    expect(activeNav("/workouts/plan")).toBe("/workouts/plan");
    expect(activeNav("/workouts")).toBe("/workouts");
    expect(activeNav("/workouts/log")).toBe("/workouts");
    expect(activeNav("/workouts/abc-123")).toBe("/workouts");
    expect(activeNav("/workouts/session")).toBe("/workouts");
  });

  it("matches the dashboard only exactly and ignores lookalike prefixes", () => {
    expect(activeNav("/")).toBe("/");
    expect(activeNav("/bodyweight")).toBeNull();
    expect(activeNav("/nope")).toBeNull();
  });

  it("lights More on phones for sections without their own tab", () => {
    for (const path of ["/settings", "/records", "/calculator", "/workouts/plan", "/more"]) expect(activeMobileNav(path)).toBe("/more");
    expect(activeMobileNav("/workouts/log")).toBe("/workouts");
    expect(activeMobileNav("/body")).toBe("/body");
    expect(activeMobileNav("/")).toBe("/");
    expect(activeMobileNav("/nope")).toBeNull();
  });

  it("titles each page for the header", () => {
    expect(pageTitle("/workouts/plan")).toBe("Plan");
    expect(pageTitle("/settings/")).toBe("Settings");
    expect(pageTitle("/workouts/abc")).toBe("Workout");
    expect(pageTitle("/nope")).toBe("Page Not Found");
  });
});
