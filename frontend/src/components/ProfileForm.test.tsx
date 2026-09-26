import { afterEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import "../lib/validation";
import { renderPage } from "../test/render";
import type { Me, Profile } from "../lib/types";
import { ProfileForm, zoneGroups } from "./ProfileForm";
import { ZoneNotice } from "../pages/SettingsPage";

const me: Me = { id: "1", email: "a@b.c", displayName: "A", profileComplete: false, unitSystem: "Metric" };
const profile: Profile = {
  displayName: "A",
  email: "a@b.c",
  dateOfBirth: "1990-01-01",
  age: 36,
  sex: "Male",
  heightCm: 180,
  activityLevel: "Moderate",
  unitSystem: "Metric",
  timeZone: "UTC",
  useLoggedActivity: false,
};

/** Pretend the device is in Tbilisi (UTC+4). */
function mockDeviceZone(zone = "Asia/Tbilisi") {
  const real = Intl.DateTimeFormat.prototype.resolvedOptions;
  vi.spyOn(Intl.DateTimeFormat.prototype, "resolvedOptions").mockImplementation(function (this: Intl.DateTimeFormat) {
    return { ...real.call(this), timeZone: zone };
  });
}

afterEach(() => vi.restoreAllMocks());

describe("time zone", () => {
  it("onboarding defaults to the device's IANA zone, not the stored one", () => {
    mockDeviceZone();
    renderPage(<ProfileForm profile={{ ...profile, timeZone: "Etc/GMT+4" }} submitLabel="Continue" detectZone />, { me });
    expect(screen.getByRole("combobox", { name: "Time zone" })).toHaveValue("Asia/Tbilisi");
  });

  it("treats the server default UTC as unset", () => {
    mockDeviceZone();
    renderPage(<ProfileForm profile={profile} submitLabel="Save" />, { me });
    expect(screen.getByRole("combobox", { name: "Time zone" })).toHaveValue("Asia/Tbilisi");
  });

  it("keeps a saved Etc/GMT zone visible but offers no other offset zones", () => {
    mockDeviceZone();
    renderPage(<ProfileForm profile={{ ...profile, timeZone: "Etc/GMT+4" }} submitLabel="Save" />, { me });
    expect(screen.getByRole("combobox", { name: "Time zone" })).toHaveValue("Etc/GMT+4");
    const offsetZones = zoneGroups(["Etc/GMT+4"]).flatMap(([, z]) => z).filter((z) => z.startsWith("Etc/"));
    expect(offsetZones).toEqual(["Etc/GMT+4"]);
    expect(zoneGroups([]).find(([r]) => r === "Asia")?.[1]).toContain("Asia/Tbilisi");
  });

  it("Settings offers a one-tap fix when the saved zone differs from the device", () => {
    mockDeviceZone();
    renderPage(<ZoneNotice profile={{ ...profile, timeZone: "Etc/GMT+4" }} />, { me });
    expect(screen.getByRole("status")).toHaveTextContent("Your device is in Asia/Tbilisi but your profile uses Etc/GMT+4 (UTC−4). Switch?");
    expect(screen.getByRole("button", { name: "Use Asia/Tbilisi" })).toBeInTheDocument();
  });
});
