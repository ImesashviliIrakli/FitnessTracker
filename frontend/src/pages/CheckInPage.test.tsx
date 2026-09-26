import { afterEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "../lib/validation";
import { renderPage } from "../test/render";
import type { Me } from "../lib/types";
import CheckInPage from "./CheckInPage";

const me: Me = { id: "1", email: "a@b.c", displayName: "A", profileComplete: true, unitSystem: "Metric" };

afterEach(() => vi.unstubAllGlobals());

function mockApi(put: () => Response) {
  const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => (init?.method === "PUT" ? put() : new Response("[]")));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("Daily check-in", () => {
  it("blocks saving an empty check-in", async () => {
    const fetchMock = mockApi(() => new Response("{}"));
    renderPage(<CheckInPage />, { me });
    await userEvent.click(await screen.findByRole("button", { name: "Save Check-in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Fill in at least one value.");
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "PUT")).toBe(false);
  });

  it("shows the server's rejection of an empty check-in inline", async () => {
    mockApi(() => new Response(JSON.stringify({ title: "Fill in at least one value.", status: 400 }), { status: 400 }));
    renderPage(<CheckInPage />, { me });
    const user = userEvent.setup();
    await user.type(await screen.findByRole("textbox", { name: "Note (optional)" }), "x");
    await user.click(screen.getByRole("button", { name: "Save Check-in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Fill in at least one value.");
  });

  it("labels which end of each scale is the bad one", async () => {
    mockApi(() => new Response("{}"));
    renderPage(<CheckInPage />, { me });
    expect(await screen.findByText("(1 = none, 5 = very sore)")).toBeInTheDocument();
    expect(screen.getByText("Very sore")).toHaveClass("text-warning");
    expect(screen.getByText("Energised")).toHaveClass("text-success");
  });
});
