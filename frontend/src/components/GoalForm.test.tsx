import { afterEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "../lib/validation";
import { renderPage } from "../test/render";
import type { Goal, Me } from "../lib/types";
import { GoalForm, paceCheck } from "./GoalForm";

const me: Me = { id: "1", email: "a@b.c", displayName: "A", profileComplete: true, unitSystem: "Metric" };
const goal: Goal = { mode: "Lose", targetWeightKg: 80, targetDate: null, weeklyRateKg: 0.5, weeklyWorkoutTarget: 3 };

function mockApi() {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const path = new URL(url).pathname;
    if (path === "/api/weights" && (init?.method ?? "GET") === "GET")
      return new Response(JSON.stringify([{ id: "w1", date: "2026-01-01", weightKg: 85, bodyFatPercent: null, note: null, leanMassKg: null, bmi: null }]));
    return new Response("{}");
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => vi.unstubAllGlobals());

describe("GoalForm", () => {
  it("rejects a Lose target above the latest weigh-in", async () => {
    const fetchMock = mockApi();
    renderPage(<GoalForm goal={goal} submitLabel="Save Goal" />, { me });
    const user = userEvent.setup();
    expect(await screen.findByText("Your latest weigh-in: 85 kg.")).toBeInTheDocument();

    const target = screen.getByRole("spinbutton", { name: "Target weight (kg)" });
    await user.clear(target);
    await user.type(target, "90");
    await user.click(screen.getByRole("button", { name: "Save Goal" }));

    expect(await screen.findByText("To lose weight, the target must be below your current 85 kg.")).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "PUT")).toBe(false);
  });

  it("limits workouts per week to 0–7", async () => {
    mockApi();
    renderPage(<GoalForm goal={goal} submitLabel="Save Goal" />, { me });
    const user = userEvent.setup();
    const n = screen.getByRole("spinbutton", { name: "Workouts per week" });
    await user.clear(n);
    await user.type(n, "9");
    await user.click(screen.getByRole("button", { name: "Save Goal" }));
    expect(await screen.findByText("Pick between 0 and 7 workouts a week.")).toBeInTheDocument();
  });

  it("maps server field errors onto the form", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) =>
        init?.method === "PUT"
          ? new Response(JSON.stringify({ status: 400, errors: { TargetWeightKg: ["Target must be below your current weight."] } }), { status: 400 })
          : new Response("[]"),
      ),
    );
    renderPage(<GoalForm goal={goal} submitLabel="Save Goal" />, { me });
    await userEvent.click(screen.getByRole("button", { name: "Save Goal" }));
    expect(await screen.findByText("Target must be below your current weight.")).toBeInTheDocument();
  });

  it("projects when the target date is missed at the current pace", () => {
    // 5 kg at 0.5 kg/week = 10 weeks; the date is 4 weeks away, so 1.25 kg/week would be needed.
    expect(paceCheck(85, 80, 0.5, "2026-01-29", "2026-01-01")).toEqual({ reached: "2026-03-12", requiredKg: 1.25 });
    expect(paceCheck(85, 80, 0.5, "2026-06-01", "2026-01-01")).toBeNull();
  });
});
