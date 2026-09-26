import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderPage } from "../test/render";
import LoginPage from "./LoginPage";

afterEach(() => vi.restoreAllMocks());

describe("LoginPage", () => {
  it("validates before calling the API", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    renderPage(<LoginPage />, { path: "/login" });
    await userEvent.click(screen.getByRole("button", { name: "Log In" }));
    expect(await screen.findByText("Enter a valid email address.")).toBeInTheDocument();
    expect(screen.getByText("Enter your password.")).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toHaveAttribute("aria-invalid", "true");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows the server error on bad credentials", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ title: "Unauthorized", detail: "Email or password is incorrect." }), { status: 401 }),
    );
    renderPage(<LoginPage />, { path: "/login" });
    await userEvent.type(screen.getByLabelText("Email"), "a@b.co");
    await userEvent.type(screen.getByLabelText("Password"), "wrong-password");
    await userEvent.click(screen.getByRole("button", { name: "Log In" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Email or password is incorrect.");
  });

  it("stores the signed-in user on success", async () => {
    const me = { id: "1", email: "a@b.co", displayName: "A", profileComplete: true, unitSystem: "Metric" };
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify(me), { status: 200 }));
    const { qc } = renderPage(<LoginPage />, { path: "/login" });
    await userEvent.type(screen.getByLabelText("Email"), "a@b.co");
    await userEvent.type(screen.getByLabelText("Password"), "Password123");
    await userEvent.click(screen.getByRole("button", { name: "Log In" }));
    await waitFor(() => expect(qc.getQueryData(["me"])).toEqual(me));
  });
});
