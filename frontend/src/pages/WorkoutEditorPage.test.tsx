import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryRouter, RouterProvider } from "react-router";
import { today } from "../lib/format";
import type { PlanEntry, Template, WorkoutInput } from "../lib/types";
import WorkoutEditorPage from "./WorkoutEditorPage";

afterEach(() => vi.restoreAllMocks());
// jsdom has no matchMedia; the editor uses it to switch the set-row layout on phones.
window.matchMedia ??= ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;

const item = { targetWeightKg: null, targetPercent1Rm: null, restSeconds: 120, tempo: null, rpe: 8, rir: null, notes: null, group: null, groupType: null, category: "Strength" as const };
const template: Template = {
  id: "t1",
  name: "Push Day A",
  description: null,
  kind: "Workout",
  exercises: [
    { ...item, exerciseId: "bench", exerciseName: "Bench Press", sets: 3, reps: 5, targetPercent1Rm: 80 },
    { ...item, exerciseId: "ohp", exerciseName: "Overhead Press", sets: 2, reps: 8, targetWeightKg: 40 },
  ],
};
const entry: PlanEntry = { id: "p1", date: "2020-01-06", templateId: "t1", templateName: "Push Day A", kind: "Workout", status: "Planned", workoutId: null, seriesId: null, note: null };
const exercises = [
  { id: "bench", name: "Bench Press", category: "Strength", primaryMuscle: "Chest", met: 5, isCustom: false },
  { id: "ohp", name: "Overhead Press", category: "Strength", primaryMuscle: "Shoulders", met: 5, isCustom: false },
];

function mockApi() {
  const posts: WorkoutInput[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const path = new URL(String(input)).pathname;
    const json = (v: unknown, status = 200) => new Response(JSON.stringify(v), { status });
    if (init?.method === "POST" && path === "/api/workouts") {
      posts.push(JSON.parse(String(init.body)));
      return json({ id: "w9" }, 201);
    }
    if (path === "/api/exercises") return json(exercises);
    if (path === "/api/templates") return json([template]);
    if (path === "/api/records") return json([{ exerciseId: "bench", exerciseName: "Bench Press", bestWeightKg: 95, bestWeightDate: null, best1Rm: 110, best1RmDate: null }]);
    if (path === `/api/plan/${entry.id}`) return json(entry);
    return json([]);
  });
  return posts;
}

function renderAt(url: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  qc.setQueryData(["me"], { id: "1", email: "a@b.co", displayName: "A", profileComplete: true, unitSystem: "Metric" });
  const router = createMemoryRouter(
    [
      { path: "/workouts/log", element: <WorkoutEditorPage /> },
      { path: "*", element: <p>elsewhere</p> },
    ],
    { initialEntries: [url] },
  );
  render(
    <QueryClientProvider client={qc}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}

describe("WorkoutEditorPage (manual log)", () => {
  it("prefills from a plan entry's template and sends startTime, type and the plan link", async () => {
    const posts = mockApi();
    const router = renderAt("/workouts/log?plan=p1");

    expect(await screen.findByRole("heading", { name: "Add workout" })).toBeInTheDocument();
    expect(await screen.findByText(/Completes: Push Day A on/)).toBeInTheDocument();
    expect(await screen.findByLabelText("Name")).toHaveValue("Push Day A");
    // 80% of a 110 kg e1RM = 88 → rounded to 87.5; fixed targets copied as is.
    expect(screen.getByLabelText("Bench Press set 1 kg")).toHaveValue(87.5);
    expect(screen.getByLabelText("Overhead Press set 2 kg")).toHaveValue(40);

    fireEvent.change(screen.getByLabelText("Start time"), { target: { value: "07:30" } });
    await userEvent.click(screen.getByLabelText("Strength"));
    await userEvent.click(screen.getByRole("button", { name: "Save Workout" }));

    await waitFor(() => expect(posts).toHaveLength(1));
    const body = posts[0]!;
    expect(body).toMatchObject({ date: "2020-01-06", startTime: "07:30", type: "Strength", templateId: "t1", planEntryId: "p1", name: "Push Day A" });
    expect(body.exercises.map((e) => e.sets.length)).toEqual([3, 2]);
    expect(body.exercises[0]!.sets[0]).toMatchObject({ reps: 5, weightKg: 87.5, rpe: 8, restSeconds: 120 });
    await waitFor(() => expect(router.state.location.pathname).toBe("/workouts/w9"));
  });

  it("sends null type and startTime by default, and appends a pulled template", async () => {
    const posts = mockApi();
    renderAt("/workouts/log");

    const pull = await screen.findByLabelText("Pull from template");
    await waitFor(() => expect(screen.getByRole("option", { name: "Push Day A" })).toBeInTheDocument());
    await userEvent.selectOptions(pull, "t1");
    expect(await screen.findByLabelText("Bench Press set 3 reps")).toHaveValue(5);
    expect(screen.getByLabelText("Name")).toHaveValue("Push Day A");

    await userEvent.click(screen.getByRole("button", { name: "Save Workout" }));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]).toMatchObject({ date: today(), startTime: null, type: null, templateId: "t1", planEntryId: null });
  });
});
