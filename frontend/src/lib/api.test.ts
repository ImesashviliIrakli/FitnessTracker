import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, api, applyFieldErrors, parseProblem, toFieldPath } from "./api";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/problem+json" } });

afterEach(() => vi.restoreAllMocks());

describe("toFieldPath", () => {
  it("maps ASP.NET keys to react-hook-form paths", () => {
    expect(toFieldPath("WeightKg")).toBe("weightKg");
    expect(toFieldPath("Exercises[0].Sets[1].Reps")).toBe("exercises.0.sets.1.reps");
  });
});

describe("parseProblem", () => {
  it("reads validation ProblemDetails", async () => {
    const err = await parseProblem(json(400, { title: "One or more validation errors occurred.", errors: { WeightKg: ["Too heavy."] } }));
    expect(err.status).toBe(400);
    expect(err.message).toBe("One or more validation errors occurred.");
    expect(err.fieldErrors).toEqual({ weightKg: ["Too heavy."] });
  });

  it("prefers detail and survives non-JSON bodies", async () => {
    expect((await parseProblem(json(409, { title: "Conflict", detail: "Already logged." }))).message).toBe("Already logged.");
    expect((await parseProblem(new Response("<html>", { status: 502 }))).message).toBe("Request failed (502).");
    expect((await parseProblem(new Response("", { status: 429 }))).message).toMatch(/Too many attempts/);
  });
});

describe("request", () => {
  it("sends credentials and the CSRF header only on writes", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response(null, { status: 204 }));
    await api.get("/api/x");
    await api.del("/api/x/1");
    const getInit = fetchMock.mock.calls[0]![1];
    const delInit = fetchMock.mock.calls[1]![1];
    expect(getInit?.credentials).toBe("include");
    expect((getInit?.headers as Record<string, string>)["X-CSRF"]).toBeUndefined();
    expect((delInit?.headers as Record<string, string>)["X-CSRF"]).toBe("1");
  });

  it("signals an expired session on 401 outside auth endpoints", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => json(401, { title: "Unauthorized" }));
    const onExpired = vi.fn();
    window.addEventListener("auth:expired", onExpired);
    await expect(api.get("/api/weights")).rejects.toBeInstanceOf(ApiError);
    await expect(api.get("/api/auth/me")).rejects.toBeInstanceOf(ApiError);
    window.removeEventListener("auth:expired", onExpired);
    expect(onExpired).toHaveBeenCalledTimes(1);
  });

  it("announces data changes after writes, but not for auth or the calculator", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => json(200, {}));
    const onChanged = vi.fn();
    window.addEventListener("data:changed", onChanged);
    await api.post("/api/weights", {});
    await api.post("/api/calculator", {});
    await api.post("/api/auth/login", {});
    await api.get("/api/weights");
    window.removeEventListener("data:changed", onChanged);
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it("maps field errors into a form", () => {
    const setError = vi.fn();
    const matched = applyFieldErrors(new ApiError(400, "bad", { weightKg: ["Too heavy."] }), setError);
    expect(matched).toBe(true);
    expect(setError).toHaveBeenCalledWith("weightKg", { type: "server", message: "Too heavy." }, { shouldFocus: true });
  });
});
