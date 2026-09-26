import { afterEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderPage } from "../test/render";
import type { Me } from "../lib/types";
import WorkoutsPage from "./WorkoutsPage";

const me: Me = { id: "u", email: "a@b.co", displayName: "A", profileComplete: true, unitSystem: "Metric" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

afterEach(() => vi.restoreAllMocks());

describe("WorkoutsPage", () => {
  it("doesn't block the page when the active-session check keeps failing", async () => {
    let activeCalls = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const path = new URL(String(input)).pathname;
      if (path === "/api/sessions/active") return activeCalls++, json({ title: "Service Unavailable" }, 503);
      if (path === "/api/workouts") return json([]);
      return json({});
    });
    renderPage(<WorkoutsPage />, { me, path: "/workouts" });

    // Landing actions and history render while the check is still retrying.
    expect(screen.getByRole("link", { name: "Plan Workouts" })).toBeInTheDocument();
    expect(await screen.findByText("No workouts yet")).toBeInTheDocument();

    const alert = await screen.findByText("Couldn’t check for a workout in progress.", undefined, { timeout: 4000 });
    expect(alert.closest("[role=alert]")).toHaveTextContent("Try Again");
    expect(activeCalls).toBe(3); // first try + two backoff retries
    expect(screen.getByRole("button", { name: /Start Workout/ })).toBeInTheDocument();
  });
});
