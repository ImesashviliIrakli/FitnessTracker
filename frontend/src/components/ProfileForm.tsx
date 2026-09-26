import { useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { toast } from "sonner";
import { api, applyFieldErrors, errorMessage } from "../lib/api";
import { meKey } from "../lib/auth";
import { numOrNull, today } from "../lib/format";
import { activityLabels, type ActivityLevel, type Profile, type UpdateProfile } from "../lib/types";
import { CM_PER_IN } from "../lib/units";
import { Button, Field, Input, Select } from "./ui";
import { DateField } from "./DatePicker";

const num = { setValueAs: numOrNull };
const activity = Object.keys(activityLabels) as ActivityLevel[];

// "Moderate — exercise 3–5 days a week" is too long for a closed select on a phone in the wide face:
// the option shows the level, the hint below spells out what the chosen level means.
const activityName = (a: ActivityLevel) => activityLabels[a].split(" — ")[0];
const activityDesc = (a: ActivityLevel | undefined) => {
  const d = a ? activityLabels[a].split(" — ")[1] : undefined;
  return d ? d.charAt(0).toUpperCase() + d.slice(1) + "." : undefined;
};

const schema = z
  .object({
    displayName: z.string().trim().min(1, "Enter your name.").max(100),
    dateOfBirth: z.string().min(1, "Enter your date of birth."),
    sex: z.enum(["Male", "Female"], { error: "Choose one — it’s used in the calorie formula." }),
    unitSystem: z.enum(["Metric", "Imperial"]),
    heightCm: z.number().nullable(),
    heightFt: z.number().nullable(),
    heightIn: z.number().nullable(),
    activityLevel: z.enum(activity as [ActivityLevel, ...ActivityLevel[]]),
    timeZone: z.string().min(1),
    useLoggedActivity: z.boolean(),
  })
  .superRefine((v, ctx) => {
    const cm = heightToCm(v);
    if (cm === null || cm < 100 || cm > 250)
      ctx.addIssue({
        code: "custom",
        path: [v.unitSystem === "Metric" ? "heightCm" : "heightFt"],
        message: v.unitSystem === "Metric" ? "Enter a height between 100 and 250 cm." : "Enter a height between 3 ft 4 in and 8 ft 2 in.",
      });
    if (v.dateOfBirth >= today()) ctx.addIssue({ code: "custom", path: ["dateOfBirth"], message: "Date of birth must be in the past." });
  });
type Form = z.infer<typeof schema>;

function heightToCm(v: Pick<Form, "unitSystem" | "heightCm" | "heightFt" | "heightIn">) {
  if (v.unitSystem === "Metric") return v.heightCm;
  if (v.heightFt === null) return null;
  return Math.round(((v.heightFt ?? 0) * 12 + (v.heightIn ?? 0)) * CM_PER_IN * 10) / 10;
}

/** The device's IANA zone, e.g. "Asia/Tbilisi". Never derive a zone from the UTC offset: Etc/GMT+4 is UTC−4. */
export const browserZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

/** Etc/GMT±N style zones have reversed signs and no DST; only listed when already saved. */
const isOffsetZone = (z: string) => z.startsWith("Etc/");

/** "UTC+4" / "UTC−4" for a zone right now. */
export function zoneOffset(zone: string) {
  try {
    const part = new Intl.DateTimeFormat("en-US", { timeZone: zone, timeZoneName: "shortOffset" }).formatToParts(new Date()).find((p) => p.type === "timeZoneName")?.value;
    return (part ?? "GMT").replace("GMT", "UTC").replace("-", "−").replace(/^UTC$/, "UTC+0");
  } catch {
    return "";
  }
}

// ponytail: only used when Intl.supportedValuesOf is missing (older Safari); the device and saved zones are always added.
const fallbackZones = [
  "Africa/Cairo", "Africa/Johannesburg", "Africa/Lagos", "America/Anchorage", "America/Chicago", "America/Denver", "America/Los_Angeles",
  "America/Mexico_City", "America/New_York", "America/Sao_Paulo", "America/Toronto", "Asia/Bangkok", "Asia/Dubai", "Asia/Hong_Kong",
  "Asia/Kolkata", "Asia/Seoul", "Asia/Shanghai", "Asia/Singapore", "Asia/Tbilisi", "Asia/Tokyo", "Australia/Sydney", "Europe/Berlin",
  "Europe/Istanbul", "Europe/London", "Europe/Madrid", "Europe/Moscow", "Europe/Paris", "Pacific/Auckland", "UTC",
];

/** Real IANA zones grouped by region ("Europe", "Asia", …), without Etc/GMT±N; `keep` zones are always present. */
export function zoneGroups(keep: string[]): [string, string[]][] {
  let all: string[] = [];
  try {
    all = Intl.supportedValuesOf("timeZone");
  } catch {
    // not supported
  }
  const zones = new Set((all.length ? all : fallbackZones).filter((z) => !isOffsetZone(z)));
  for (const z of keep) if (z) zones.add(z);
  const groups = new Map<string, string[]>();
  for (const z of [...zones].sort()) {
    const region = (!isOffsetZone(z) && z.split("/")[1] && z.split("/")[0]) || "Other";
    groups.set(region, [...(groups.get(region) ?? []), z]);
  }
  return [...groups];
}

export function ProfileForm({
  profile,
  submitLabel,
  onSaved,
  detectZone,
}: {
  profile: Profile;
  submitLabel: string;
  onSaved?: () => void;
  /** Onboarding: start from the device's zone instead of whatever is stored. */
  detectZone?: boolean;
}) {
  const qc = useQueryClient();
  const device = browserZone();
  // The server's default is "UTC"; treat it (or an empty value) as "not chosen yet".
  const initialZone = detectZone || !profile.timeZone || profile.timeZone === "UTC" ? device : profile.timeZone;
  const groups = useMemo(() => zoneGroups([initialZone, device]), [initialZone, device]);

  const totalIn = profile.heightCm ? Math.round(profile.heightCm / CM_PER_IN) : null;
  const {
    register,
    control,
    handleSubmit,
    watch,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: {
      displayName: profile.displayName,
      dateOfBirth: profile.dateOfBirth ?? "",
      sex: profile.sex ?? undefined,
      unitSystem: profile.unitSystem,
      heightCm: profile.heightCm,
      heightFt: totalIn === null ? null : Math.floor(totalIn / 12),
      heightIn: totalIn === null ? null : totalIn % 12,
      activityLevel: profile.activityLevel,
      timeZone: initialZone,
      useLoggedActivity: profile.useLoggedActivity ?? false,
    },
  });
  const imperial = watch("unitSystem") === "Imperial";
  const logged = watch("useLoggedActivity");

  const onSubmit = handleSubmit(async (v) => {
    const body: UpdateProfile = {
      displayName: v.displayName,
      dateOfBirth: v.dateOfBirth,
      sex: v.sex,
      heightCm: heightToCm(v),
      activityLevel: v.activityLevel,
      unitSystem: v.unitSystem,
      timeZone: v.timeZone,
      useLoggedActivity: v.useLoggedActivity,
    };
    try {
      await api.put<Profile>("/api/profile", body);
      await qc.refetchQueries({ queryKey: meKey });
      toast.success("Profile saved");
      onSaved?.();
    } catch (e) {
      if (!applyFieldErrors(e, setError)) toast.error(errorMessage(e));
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4 sm:grid-cols-2">
      <Field label="Name" error={errors.displayName?.message}>
        <Input autoComplete="name" {...register("displayName")} />
      </Field>
      <Field label="Units" error={errors.unitSystem?.message}>
        <Select {...register("unitSystem")}>
          <option value="Metric">Metric (kg, cm, km)</option>
          <option value="Imperial">Imperial (lb, in, mi)</option>
        </Select>
      </Field>
      <DateField control={control} name="dateOfBirth" label="Date of birth" error={errors.dateOfBirth?.message} max={today()} required />
      <Field label="Sex" error={errors.sex?.message} hint="Used only for the calorie estimate.">
        <Select defaultValue="" {...register("sex")}>
          <option value="" disabled>
            Choose…
          </option>
          <option value="Female">Female</option>
          <option value="Male">Male</option>
        </Select>
      </Field>
      {imperial ? (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Height (ft)" error={errors.heightFt?.message}>
            <Input type="number" inputMode="numeric" min={3} max={8} autoComplete="off" {...register("heightFt", num)} />
          </Field>
          <Field label="Height (in)" error={errors.heightIn?.message}>
            <Input type="number" inputMode="numeric" min={0} max={11} autoComplete="off" {...register("heightIn", num)} />
          </Field>
        </div>
      ) : (
        <Field label="Height (cm)" error={errors.heightCm?.message}>
          <Input type="number" inputMode="decimal" step="0.1" autoComplete="off" placeholder="175…" {...register("heightCm", num)} />
        </Field>
      )}
      <Field label="Activity level" error={errors.activityLevel?.message} hint={logged ? "Not used for your calorie target while logged workouts are on." : `${activityDesc(watch("activityLevel")) ?? ""} Your usual week, including training.`.trim()}>
        <Select {...register("activityLevel")}>
          {activity.map((a) => (
            <option key={a} value={a}>
              {activityName(a)}
            </option>
          ))}
        </Select>
      </Field>
      <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-line bg-surface-2/40 p-3 sm:col-span-2">
        <input type="checkbox" role="switch" className="peer sr-only" {...register("useLoggedActivity")} />
        <span
          aria-hidden="true"
          className="relative mt-0.5 h-6 w-10 shrink-0 rounded-full border border-line bg-surface-2 transition-colors peer-checked:border-accent peer-checked:bg-accent peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent-fg after:absolute after:top-0.5 after:left-0.5 after:size-4.5 after:rounded-full after:bg-muted after:transition-transform peer-checked:after:translate-x-4 peer-checked:after:bg-accent-ink"
        />
        <span className="min-w-0">
          <span className="block text-[0.8125rem] leading-snug">Use my logged workouts for activity</span>
          <span className="mt-1 block text-xs leading-snug text-muted">
            Your maintenance (TDEE) becomes resting × 1.2 plus your average logged training calories, instead of the activity-level multiplier.
          </span>
        </span>
      </label>
      <Field label="Time zone" error={errors.timeZone?.message} hint="Decides when your day and week start." className="sm:col-span-2">
        <Select {...register("timeZone")}>
          {groups.map(([region, zones]) => (
            <optgroup key={region} label={region}>
              {zones.map((z) => (
                <option key={z} value={z}>
                  {z.replaceAll("_", " ")}
                  {isOffsetZone(z) ? ` (${zoneOffset(z)})` : ""}
                  {z === device ? " (this device)" : ""}
                </option>
              ))}
            </optgroup>
          ))}
        </Select>
      </Field>
      <div className="sm:col-span-2">
        <Button type="submit" loading={isSubmitting}>
          {isSubmitting ? "Saving…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}
