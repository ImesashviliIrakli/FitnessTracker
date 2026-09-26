import { describe, expect, it } from "vitest";
import { units } from "./units";
import { estimate1Rm, setVolume } from "./training";

describe("units", () => {
  const metric = units("Metric");
  const imperial = units("Imperial");

  it("passes metric values through", () => {
    expect(metric.toWeight(80.04)).toBe(80);
    expect(metric.fromWeight(80)).toBe(80);
    expect(metric.toDistance(5000)).toBe(5);
    expect(metric.formatHeight(180.4)).toBe("180 cm");
  });

  it("converts imperial and round-trips stably", () => {
    expect(imperial.toWeight(100)).toBe(220.5);
    expect(imperial.fromWeight(220.5)).toBeCloseTo(100.017, 3);
    expect(imperial.toLength(2.54)).toBe(1);
    expect(imperial.fromLength(10)).toBe(25.4);
    expect(imperial.toDistance(1609.344)).toBe(1);
    expect(imperial.fromDistance(3.1)).toBeCloseTo(4988.97, 1);
    expect(imperial.formatHeight(180)).toBe("5 ft 11 in");
    // Save, reload, save again must not drift.
    const once = imperial.fromWeight(imperial.toWeight(83.2));
    expect(imperial.toWeight(once)).toBe(imperial.toWeight(83.2));
  });

  it("formats pace per km and per mile", () => {
    expect(metric.formatPace(300)).toBe("5:00");
    expect(imperial.formatPace(300)).toBe("8:03");
  });
});

describe("training math", () => {
  it("estimates 1RM with Epley for 1-12 reps only", () => {
    expect(estimate1Rm(100, 1)).toBe(100);
    expect(estimate1Rm(100, 5)).toBeCloseTo(116.67, 2);
    expect(estimate1Rm(100, 13)).toBeNull();
    expect(estimate1Rm(null, 5)).toBeNull();
  });

  it("excludes warm-ups from volume", () => {
    expect(setVolume({ weight: 100, reps: 5, isWarmup: false })).toBe(500);
    expect(setVolume({ weight: 100, reps: 5, isWarmup: true })).toBe(0);
  });
});
