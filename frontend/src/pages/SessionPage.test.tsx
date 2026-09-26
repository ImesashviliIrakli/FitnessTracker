import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderPage } from "../test/render";
import type { Me, Session, SessionSummary } from "../lib/types";
import SessionPage from "./SessionPage";

const me: Me = { id: "u", email: "a@b.co", displayName: "A", profileComplete: true, unitSystem: "Metric" };
const set = (id: string) => ({
  id,
  targetReps: 5,
  targetWeightKg: 100,
  targetRpe: null,
  reps: null,
  weightKg: null,
  rpe: null,
  rir: null,
  durationSeconds: null,
  distanceM: null,
  isWarmup: false,
  done: false,
});
const session: Session = {
  id: "s1",
  name: "Leg day",
  startedAt: new Date(Date.now() - 20 * 60_000).toISOString(),
  templateId: null,
  planEntryId: null,
  notes: null,
  updatedAt: new Date().toISOString(),
  exercises: [
    { id: "e1", exerciseId: "sq", exerciseName: "Back Squat", category: "Strength", restSeconds: 120, tempo: null, notes: null, group: null, groupType: null, skipped: false, sets: [set("a"), set("b")] },
  ],
};
const summary = {
  workout: { id: "w1", name: "Leg day" },
  durationMinutes: 20,
  setsDone: 1,
  totalVolumeKg: 500,
  estimatedCalories: 120,
  prs: [{ exerciseId: "sq", exerciseName: "Back Squat", kind: "Weight", value: 100, previous: 95 }],
  weekStreak: 3,
  workoutsThisWeek: 2,
  weeklyTarget: 3,
  nextPlan: null,
} as unknown as SessionSummary;

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function mockApi(active: Session | null) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    if (url.pathname === "/api/sessions/active") return active ? json(active) : new Response(null, { status: 204 });
    if (url.pathname === "/api/exercises") return json([]);
    if (method === "POST" && url.pathname === "/api/sessions/s1/log") return json(active);
    if (method === "POST" && url.pathname === "/api/sessions/s1/finish") return json(summary, 201);
    return json({});
  });
}

beforeAll(() => {
  // jsdom has no modal dialogs; opening one just shows it.
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
    this.removeAttribute("open");
  };
});
afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("SessionPage", () => {
  it("logs a checked set with targets filled, then finishes into the summary", async () => {
    const fetchMock = mockApi(session);
    renderPage(<SessionPage />, { me, path: "/workouts/session" });

    await userEvent.click(await screen.findByRole("button", { name: "Complete Back Squat set 1" }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([u]) => String(u).endsWith("/api/sessions/s1/log"))).toBe(true));
    const [, init] = fetchMock.mock.calls.find(([u]) => String(u).endsWith("/log"))!;
    expect(JSON.parse(String(init!.body))).toMatchObject({ exerciseId: "e1", setId: "a", reps: 5, weightKg: 100, done: true });
    expect(screen.getByLabelText("Back Squat set 1 kg")).toHaveValue("100");
    expect(screen.getByText("1/2")).toBeInTheDocument();
    expect(screen.getByRole("timer", { name: "Rest timer" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Finish Workout" }));
    const dialog = await screen.findByRole("dialog", { name: "Finish workout?" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Finish Workout" }));

    expect(await screen.findByRole("heading", { name: "Leg day", level: 1 })).toBeInTheDocument();
    expect(screen.getByText("Workout complete")).toBeInTheDocument();
    expect(screen.getByText("Personal record")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View Workout" })).toHaveAttribute("href", "/workouts/w1");
    const finish = fetchMock.mock.calls.find(([u]) => String(u).endsWith("/finish"))!;
    expect(finish[1]!.method).toBe("POST");
  });

  it("redirects to Workouts when no session is active", async () => {
    mockApi(null);
    renderPage(<SessionPage />, { me, path: "/workouts/session" });
    expect(await screen.findByText("elsewhere")).toBeInTheDocument();
  });

  const logCalls = (m: ReturnType<typeof mockApi>) => m.mock.calls.filter(([u]) => String(u).endsWith("/api/sessions/s1/log"));

  it("won't complete a strength set without weight and reps", async () => {
    const open = { ...set("a"), targetReps: null, targetWeightKg: null };
    const fetchMock = mockApi({ ...session, exercises: [{ ...session.exercises[0]!, sets: [open] }] });
    renderPage(<SessionPage />, { me, path: "/workouts/session" });

    await userEvent.click(await screen.findByRole("button", { name: "Complete Back Squat set 1" }));
    expect(screen.getByText("Enter weight and reps to complete this set.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Complete Back Squat set 1" })).toHaveAttribute("aria-pressed", "false");
    expect(logCalls(fetchMock)).toHaveLength(0);
  });

  it("keeps out-of-range input with an inline error and never sends it", async () => {
    const fetchMock = mockApi(session);
    renderPage(<SessionPage />, { me, path: "/workouts/session" });

    const reps = await screen.findByLabelText("Back Squat set 1 Reps");
    await userEvent.type(reps, "2.5");
    expect(reps).toHaveValue("2.5");
    expect(reps).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("Reps: a whole number from 0 to 1000.")).toBeInTheDocument();

    const kg = screen.getByLabelText("Back Squat set 1 kg");
    await userEvent.type(kg, "-5");
    expect(kg).toHaveValue("-5");
    expect(kg).toHaveAttribute("aria-invalid", "true");

    await userEvent.click(screen.getByRole("button", { name: "Complete Back Squat set 1" }));
    expect(screen.getByText(/Fix the highlighted value first\./)).toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 50));
    expect(logCalls(fetchMock)).toHaveLength(0);

    // Fixing it clears the error and logs normally.
    await userEvent.clear(reps);
    await userEvent.type(reps, "3");
    await userEvent.clear(kg);
    await userEvent.type(kg, "90");
    expect(reps).not.toHaveAttribute("aria-invalid");
    await userEvent.click(screen.getByRole("button", { name: "Complete Back Squat set 1" }));
    await waitFor(() => expect(logCalls(fetchMock).length).toBeGreaterThan(0));
    const last = logCalls(fetchMock).at(-1)!;
    expect(JSON.parse(String(last[1]!.body))).toMatchObject({ reps: 3, weightKg: 90, done: true });
  });

  it("shows a 400 from the server on the field and keeps the input", async () => {
    const fetchMock = mockApi(session);
    const inner = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation(async (input, init) =>
      String(input).endsWith("/log")
        ? json({ title: "One or more validation errors occurred.", status: 400, errors: { Reps: ["Reps must be between 0 and 1000."] } }, 400)
        : inner(input, init),
    );
    renderPage(<SessionPage />, { me, path: "/workouts/session" });

    await userEvent.click(await screen.findByRole("button", { name: "Complete Back Squat set 1" }));
    expect(await screen.findByText("Reps must be between 0 and 1000.")).toBeInTheDocument();
    expect(screen.getByLabelText("Back Squat set 1 Reps")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Back Squat set 1 Reps")).toHaveValue("5");
  });

  it("retries a failed load, then offers Try Again instead of a reload", async () => {
    let calls = 0;
    const fetchMock = mockApi(session);
    const inner = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation(async (input, init) =>
      String(input).endsWith("/api/sessions/active") && ++calls <= 3 ? json({ title: "Service Unavailable" }, 503) : inner(input, init),
    );
    renderPage(<SessionPage />, { me, path: "/workouts/session" });

    await userEvent.click(await screen.findByRole("button", { name: "Try Again" }, { timeout: 4000 }));
    expect(calls).toBe(4);
    expect(await screen.findByRole("button", { name: "Complete Back Squat set 1" })).toBeInTheDocument();
  });

  it("restores unsynced local edits over the server copy after a reload", async () => {
    const local = { ...session, exercises: [{ ...session.exercises[0]!, sets: [{ ...set("a"), reps: 7, weightKg: 102.5, done: true }, set("b")] }] };
    localStorage.setItem("fittrack.session-draft", JSON.stringify(local));
    const fetchMock = mockApi(session);
    renderPage(<SessionPage />, { me, path: "/workouts/session" });
    expect(await screen.findByLabelText("Back Squat set 1 kg")).toHaveValue("102.5");
    await waitFor(() => expect(fetchMock.mock.calls.some(([u, i]) => String(u).endsWith("/api/sessions/s1") && i?.method === "PUT")).toBe(true));
  });
});
