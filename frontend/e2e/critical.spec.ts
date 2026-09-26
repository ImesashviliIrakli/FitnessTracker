import { expect, test, type Locator, type Page } from "@playwright/test";

/** Opens the DatePicker labelled `label` inside `scope` and picks `iso` (YYYY-MM-DD) via its month/year selects. */
async function pickDate(page: Page, scope: Locator | Page, label: string, iso: string) {
  await scope.getByRole("button", { name: new RegExp(`^${label} `) }).click();
  const [y, m] = iso.split("-").map(Number);
  await page.getByLabel("Year", { exact: true }).selectOption(String(y));
  await page.getByLabel("Month", { exact: true }).selectOption(String(m! - 1));
  await page.getByRole("grid").locator(`[data-date="${iso}"]`).click();
}

// Register → onboarding → log weight → live workout session → summary → dashboard reflects both.
test("new user can set up, log a weigh-in, train a live session, and see them on the dashboard", async ({ page }) => {
  const email = `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;

  await page.goto("/register");
  await page.getByLabel("Name").fill("Casey");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("Str0ngPassword!");
  await page.getByRole("button", { name: "Create Account" }).click();

  // Step 1: profile
  await expect(page.getByRole("heading", { name: "Set up your profile" })).toBeVisible();
  await pickDate(page, page, "Date of birth", "1992-05-14");
  await page.getByLabel("Sex").selectOption("Female");
  await page.getByLabel("Height (cm)").fill("168");
  await page.getByRole("button", { name: "Continue" }).click();

  // Step 2: starting weight + goal
  await expect(page.getByRole("heading", { name: "Where you’re starting" })).toBeVisible();
  await page.getByLabel("Current weight (kg)").fill("72.5");
  await page.getByLabel("Goal", { exact: true }).selectOption("Lose");
  await page.getByLabel("Target weight (kg)").fill("66");
  await page.getByLabel("Weekly rate (kg/week)").fill("0.5");
  await page.getByLabel("Workouts per week").fill("3");
  await page.getByRole("button", { name: "Finish Setup" }).click();

  await expect(page.getByRole("heading", { name: "Hi, Casey" })).toBeVisible();
  await expect(page.getByText("72.5 kg").first()).toBeVisible();

  // Log a second weigh-in for yesterday so the trend chart appears.
  await page.getByRole("button", { name: "Log Weight" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Log Weight" });
  const yesterday = new Date(Date.now() - 86_400_000);
  const iso = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, "0")}-${String(yesterday.getDate()).padStart(2, "0")}`;
  await pickDate(page, dialog, "Date", iso);
  await dialog.getByLabel("Weight (kg)").fill("72.9");
  await dialog.getByRole("button", { name: "Log Weight" }).click();
  await expect(dialog).toBeHidden();

  // Live session: start an empty workout, add an exercise, check off a set, finish.
  await page.goto("/workouts");
  await page.getByRole("button", { name: /Start Workout/ }).click();
  const start = page.getByRole("dialog", { name: "Start Workout" });
  await start.getByLabel("Workout name (optional)").fill("Upper body");
  await start.getByRole("button", { name: "Start Empty" }).click();
  await expect(page).toHaveURL(/\/workouts\/session$/);
  await expect(page.getByRole("heading", { name: "Upper body" })).toBeVisible();

  await page.getByRole("button", { name: "Add Exercise" }).click();
  const picker = page.getByRole("dialog", { name: "Add Exercise" });
  await picker.getByLabel("Search exercises").fill("bench");
  await picker.getByRole("list", { name: "Exercises" }).getByRole("button").first().click();
  await page.getByLabel(/set 1 kg$/).fill("60");
  await page.getByLabel(/set 1 Reps$/).fill("8");
  await page.getByRole("button", { name: /^Complete .* set 1$/ }).click();
  await expect(page.getByText("1/3")).toBeVisible();
  await expect(page.getByText("Saved")).toBeVisible();

  // Survives a reload.
  await page.reload();
  await expect(page.getByLabel(/set 1 kg$/)).toHaveValue("60");

  await page.getByRole("button", { name: "Finish Workout" }).click();
  await page.getByRole("dialog", { name: "Finish workout?" }).getByRole("button", { name: "Finish Workout" }).click();
  await expect(page.getByText("Workout complete")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Upper body", level: 1 })).toBeVisible();
  await expect(page.getByText("Sets done")).toBeVisible();

  // Dashboard reflects the workout and the records.
  await page.goto("/");
  await expect(page.getByText("of 3 workouts")).toBeVisible();
  await expect(page.getByRole("region", { name: "Recent records" }).getByText(/bench/i)).toBeVisible();
  await expect(page.getByRole("img", { name: /Weight from/ })).toBeVisible();
});
