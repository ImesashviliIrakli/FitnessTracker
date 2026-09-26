import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderPage } from "../../test/render";
import type { Me, Template } from "../../lib/types";
import { ScheduleSheet } from "./ScheduleSheet";
import { TemplateEditor } from "./TemplatesTab";

const me: Me = { id: "1", email: "a@b.c", displayName: "A", profileComplete: true, unitSystem: "Metric" };
const push: Template = {
  id: "t1",
  name: "Push A",
  description: null,
  kind: "Workout",
  exercises: [
    {
      exerciseId: "bench",
      exerciseName: "Bench Press",
      category: "Strength",
      sets: 4,
      reps: 6,
      targetWeightKg: 90,
      targetPercent1Rm: null,
      restSeconds: 120,
      tempo: null,
      rpe: null,
      rir: null,
      notes: null,
      group: null,
      groupType: null,
    },
  ],
};

function mockApi() {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const path = new URL(url).pathname;
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
    if (init?.method === "POST" && path === "/api/plan") return json({ ...JSON.parse(String(init.body)), id: "p1", status: "Planned" }, 201);
    if (path === "/api/templates") return json([push]);
    return json([]);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}
const writes = (f: ReturnType<typeof mockApi>) => f.mock.calls.filter(([, init]) => init?.method && init.method !== "GET");

afterEach(() => vi.unstubAllGlobals());

describe("quick-add schedule sheet", () => {
  it("plans a template on the tapped day", async () => {
    const fetchMock = mockApi();
    const onClose = vi.fn();
    renderPage(<ScheduleSheet target={{ date: "2026-09-30" }} onClose={onClose} />, { me });
    const user = userEvent.setup();

    const select = await screen.findByRole("combobox", { name: "Template", hidden: true });
    await screen.findByRole("option", { name: "Push A", hidden: true });
    await user.selectOptions(select, "t1");
    await user.click(screen.getByRole("button", { name: "Plan It", hidden: true }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const [call] = writes(fetchMock);
    expect(call![0]).toMatch(/\/api\/plan$/);
    expect(call![1]!.method).toBe("POST");
    expect(JSON.parse(String(call![1]!.body))).toEqual({ templateId: "t1", date: "2026-09-30", note: null });
  });
});

describe("template editor", () => {
  it("won't save a rest day that still has exercises", async () => {
    const fetchMock = mockApi();
    const onDone = vi.fn();
    renderPage(<TemplateEditor template={push} onDone={onDone} />, { me });
    const user = userEvent.setup();

    await user.click(screen.getByRole("radio", { name: "Rest day", hidden: true }));
    await user.click(screen.getByRole("button", { name: "Save Template", hidden: true }));

    expect(await screen.findByText(/A rest day has no exercises/)).toBeInTheDocument();
    expect(writes(fetchMock)).toHaveLength(0);
    expect(onDone).not.toHaveBeenCalled();
  });
});
