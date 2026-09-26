import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import type { PlanEntry } from "../../lib/types";
import { Legend } from "./PlanCalendar";
import { entryTone, toneIcon, toneLabel } from "./shared";

const entry = (p: Partial<PlanEntry>): PlanEntry => ({ id: "e", date: "2026-09-22", templateId: "t", templateName: "Push A", kind: "Workout", status: "Planned", workoutId: null, seriesId: null, note: null, ...p });

describe("calendar status labels", () => {
  it("maps entries to a status with a label and an icon", () => {
    const today = "2026-09-24";
    const cases: [Partial<PlanEntry>, string][] = [
      [{ status: "Completed" }, "Completed"],
      [{ status: "Skipped" }, "Skipped"],
      [{ date: "2026-09-23" }, "Missed"],
      [{ date: "2026-09-25" }, "Planned"],
      [{ kind: "RestDay", date: "2026-09-20" }, "Rest day"], // past rest days are never "missed"
    ];
    for (const [p, label] of cases) {
      const tone = entryTone(entry(p), today);
      expect(toneLabel[tone]).toBe(label);
      expect(toneIcon[tone]).toBeTruthy();
    }
  });

  it("legend pairs every status with an icon and a word", () => {
    render(<Legend />);
    const items = within(screen.getByRole("list", { name: "Legend" })).getAllByRole("listitem");
    const labels = items.map((li) => li.textContent);
    expect(labels).toEqual(["Completed", "Planned", "Skipped", "Missed", "Rest day", "Logged, unplanned", "Repeating"]);
    for (const li of items) expect(li.querySelector("svg, span[aria-hidden]")).not.toBeNull();
  });
});
