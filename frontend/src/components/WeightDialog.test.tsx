import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "../lib/validation";
import { renderPage } from "../test/render";
import { today } from "../lib/format";
import type { Me } from "../lib/types";
import { WeightDialog } from "./WeightDialog";

const me: Me = { id: "1", email: "a@b.c", displayName: "A", profileComplete: true, unitSystem: "Metric" };

afterEach(() => vi.unstubAllGlobals());

describe("Log Weight dialog", () => {
  it("opens today's existing weigh-in for editing and saves it with PUT", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const path = new URL(url).pathname;
      if (path === "/api/weights" && (init?.method ?? "GET") === "GET")
        return new Response(JSON.stringify([{ id: "w7", date: today(), weightKg: 84.2, bodyFatPercent: 20, note: "Fasted", leanMassKg: null, bmi: null }]));
      return new Response("{}");
    });
    vi.stubGlobal("fetch", fetchMock);
    renderPage(<WeightDialog open onClose={() => {}} />, { me });

    expect(await screen.findByText(/You already logged today — editing/)).toBeInTheDocument();
    expect(screen.getByRole("spinbutton", { name: "Weight (kg)", hidden: true })).toHaveValue(84.2);

    await userEvent.click(screen.getByRole("button", { name: "Save Changes", hidden: true }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([, init]) => init?.method === "PUT")).toBe(true));
    const [url, init] = fetchMock.mock.calls.find(([, i]) => i?.method === "PUT")!;
    expect(new URL(url).pathname).toBe("/api/weights/w7");
    expect(JSON.parse(String(init!.body))).toMatchObject({ date: today(), weightKg: 84.2, bodyFatPercent: 20, note: "Fasted" });
    expect(fetchMock.mock.calls.some(([, i]) => i?.method === "POST")).toBe(false);
  });
});
