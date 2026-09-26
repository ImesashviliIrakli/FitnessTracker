import { afterEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "../../lib/validation";
import { renderPage } from "../../test/render";
import type { Me, Template } from "../../lib/types";
import { TemplateEditor } from "./TemplatesTab";

const me: Me = { id: "1", email: "a@b.c", displayName: "A", profileComplete: true, unitSystem: "Metric" };
const item = { targetWeightKg: 90, targetPercent1Rm: null, restSeconds: 120, tempo: null, rpe: null, rir: null, notes: null, group: null, groupType: null };
const push: Template = {
  id: "t1",
  name: "Push A",
  description: null,
  kind: "Workout",
  exercises: [{ ...item, exerciseId: "bench", exerciseName: "Bench Press", category: "Strength", sets: 4, reps: 6 }],
};

afterEach(() => vi.unstubAllGlobals());

describe("template editor validation", () => {
  it("outlines every invalid field and names the problem", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response("[]"));
    vi.stubGlobal("fetch", fetchMock);
    renderPage(<TemplateEditor template={push} onDone={() => {}} />, { me });
    const user = userEvent.setup();

    const [sets, reps] = screen.getAllByRole("spinbutton", { hidden: true }) as [HTMLElement, HTMLElement];
    await user.clear(sets);
    await user.type(sets, "0");
    await user.clear(reps);
    await user.type(reps, "0");
    await user.click(screen.getByRole("button", { name: "Save Template", hidden: true }));

    expect(await screen.findByText(/Sets: 1–20/)).toBeInTheDocument();
    expect(screen.getByText(/Reps: 1–1000/)).toBeInTheDocument();
    expect(sets).toHaveAttribute("aria-invalid", "true");
    expect(reps).toHaveAttribute("aria-invalid", "true");
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(0);
  });
});
