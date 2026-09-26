import { describe, expect, it } from "vitest";
import { z } from "zod";
import "./validation";

const msg = (schema: z.ZodType, v: unknown) => schema.safeParse(v).error?.issues[0]?.message;

describe("friendly zod messages", () => {
  it("replaces developer wording", () => {
    expect(msg(z.number().min(0), -1)).toBe("Must be 0 or more");
    expect(msg(z.number().max(1000), 1001)).toMatch(/^Must be at most 1.?000$/);
    expect(msg(z.number().int(), 1.5)).toBe("Must be a whole number");
    expect(msg(z.number(), null)).toBe("Required");
    expect(msg(z.string().min(1), "")).toBe("Required");
  });

  it("keeps messages written in the schema", () => {
    expect(msg(z.number().min(1, "Sets: 1–20."), 0)).toBe("Sets: 1–20.");
  });
});
