import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { units } from "../lib/units";
import type { CalorieResult } from "../lib/types";
import { CalorieResultView } from "./CalorieResultView";

const result: CalorieResult = {
  formula: "KatchMcArdle",
  bmr: 1780,
  tdee: 2759,
  targetCalories: 2209,
  dailyAdjustment: -550,
  weeklyRateKg: 0.5,
  projectedWeeks: 20,
  projectedDate: "2027-02-12",
  macros: { proteinG: 160, fatG: 61, carbsG: 250 },
  warnings: ["Your target is close to your BMR."],
  activitySource: "ActivityLevel",
  exerciseKcalPerDay: null,
};

describe("CalorieResultView", () => {
  it("renders target, maintenance, macros, warnings and the disclaimer", () => {
    render(<CalorieResultView result={result} u={units("Metric")} />);
    expect(screen.getByText(/2,209|2209/)).toBeInTheDocument();
    expect(screen.getByText(/550 kcal below maintenance/)).toBeInTheDocument();
    expect(screen.getByText("Katch-McArdle")).toBeInTheDocument();
    expect(screen.getByText("160 g")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Your target is close to your BMR.");
    expect(screen.getByText(/not medical advice/)).toBeInTheDocument();
  });

  it("shows the weekly rate in the user's units", () => {
    render(<CalorieResultView result={result} u={units("Imperial")} />);
    expect(screen.getByText(/about 1\.1 lb a week/)).toBeInTheDocument();
  });

  it("names the activity level as the source by default", () => {
    render(<CalorieResultView result={result} u={units("Metric")} />);
    expect(screen.getByText("Activity level")).toBeInTheDocument();
  });

  it("shows logged workouts as the activity source with their kcal/day", () => {
    render(<CalorieResultView result={{ ...result, activitySource: "LoggedWorkouts", exerciseKcalPerDay: 312 }} u={units("Metric")} />);
    expect(screen.getByText(/Your logged workouts/)).toHaveTextContent("+312 kcal/day");
  });
});
