import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderPage } from "../test/render";
import type { Dashboard, PlanEntry } from "../lib/types";
import { TodaySection } from "./DashboardPage";

afterEach(() => vi.restoreAllMocks());

const plan: PlanEntry = { id: "p1", date: "2020-01-06", templateId: "t1", templateName: "Push Day A", kind: "Workout", status: "Planned", workoutId: null, seriesId: null, note: null };
const dash = (nextPlan: PlanEntry | null) => ({ nextPlan }) as Dashboard;

describe("Dashboard Today card", () => {
  it("offers Start and Log manually for the next plan, and starts a session from it", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ id: "s1" }), { status: 201 }));
    const { router } = renderPage(<TodaySection d={dash(plan)} />);

    expect(screen.getByText(/Push Day A/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Log manually" })).toHaveAttribute("href", "/workouts/log?plan=p1");
    expect(screen.queryByRole("link", { name: /Plan your week/ })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Start" }));
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toMatch(/\/api\/sessions$/);
    expect(JSON.parse(String(init!.body))).toEqual({ planEntryId: "p1", templateId: null, name: null });
    await waitFor(() => expect(router.state.location.pathname).toBe("/workouts/session"));
  });

  it("goes to the running session when one is already active (409)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ title: "Conflict", status: 409 }), { status: 409 }));
    const { router } = renderPage(<TodaySection d={dash(plan)} />);
    await userEvent.click(screen.getByRole("button", { name: "Start" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/workouts/session"));
  });

  it("suggests starting or planning when nothing is planned", () => {
    renderPage(<TodaySection d={dash(null)} />);
    expect(screen.getByRole("link", { name: /Start a workout/ })).toHaveAttribute("href", "/workouts");
    expect(screen.getByRole("link", { name: /Plan your week/ })).toHaveAttribute("href", "/workouts/plan");
    expect(screen.queryByRole("button", { name: "Start" })).not.toBeInTheDocument();
  });
});
