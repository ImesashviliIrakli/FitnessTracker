import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryRouter, RouterProvider } from "react-router";
import type { Me } from "./lib/types";
import { routes } from "./router";

const me: Me = { id: "1", email: "a@b.c", displayName: "Riley Adams", profileComplete: true, unitSystem: "Metric" };

function renderAt(path: string, user: Me | null | undefined) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  if (user !== undefined) qc.setQueryData(["me"], user);
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <QueryClientProvider client={qc}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}

afterEach(() => vi.unstubAllGlobals());

describe("routing", () => {
  it("shows a 404 page with a way back for unknown URLs (no silent redirect)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("[]", { status: 200 })));
    const router = renderAt("/no-such-page", me);
    expect(await screen.findByRole("heading", { name: "Page not found" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Back to Dashboard/ })).toHaveAttribute("href", "/");
    expect(router.state.location.pathname).toBe("/no-such-page");
  });

  it("shows an error with Retry when the auth check fails with a 5xx", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ title: "Server error" }), { status: 503 })));
    renderAt("/", undefined);
    expect(await screen.findByRole("alert")).toHaveTextContent("Server error");
    expect(screen.getByRole("button", { name: "Try Again" })).toBeInTheDocument();
  });
});
