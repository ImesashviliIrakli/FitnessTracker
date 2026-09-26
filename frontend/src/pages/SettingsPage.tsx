import { useEffect, useState } from "react";
import { useLocation } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { Clock, Download } from "lucide-react";
import { api, ApiError, download, errorMessage } from "../lib/api";
import { clearSession, useLogout } from "../lib/auth";
import { getTheme, setTheme, type Theme } from "../lib/theme";
import type { Goal, Profile, UpdateProfile } from "../lib/types";
import { GoalForm } from "../components/GoalForm";
import { browserZone, ProfileForm, zoneOffset } from "../components/ProfileForm";
import { Button, Card, Dialog, ErrorState, Field, Input, Loading, PageHeader, Segmented } from "../components/ui";

function Section({ id, title, description, children }: { id: string; title: string; description?: string; children: React.ReactNode }) {
  return (
    <Card aria-labelledby={`${id}-h`} id={id} className="scroll-mt-6">
      <h2 id={`${id}-h`} className="text-base font-semibold sm:text-lg">
        {title}
      </h2>
      {description && <p className="mt-1 max-w-prose text-[0.8125rem] leading-relaxed text-muted">{description}</p>}
      <div className="mt-5">{children}</div>
    </Card>
  );
}

export default function SettingsPage() {
  const profile = useQuery({ queryKey: ["profile"], queryFn: () => api.get<Profile>("/api/profile") });
  const goal = useQuery({ queryKey: ["goals"], queryFn: () => api.get<Goal>("/api/goals") });
  const [theme, setThemeState] = useState<Theme>(getTheme);
  const [exporting, setExporting] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const logout = useLogout();
  const { hash } = useLocation();
  const loaded = !profile.isPending && !goal.isPending;
  useEffect(() => {
    if (loaded && hash) document.getElementById(hash.slice(1))?.scrollIntoView();
  }, [loaded, hash]);

  const exportFile = async (path: string, name: string) => {
    setExporting(path);
    try {
      await download(path, name);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setExporting(null);
    }
  };

  return (
    <>
      <PageHeader title="Settings" />
      <div className="space-y-6">
        <Section id="profile" title="Profile" description="Used for BMI, calorie estimates and when your day and week begin.">
          {profile.isPending ? <Loading /> : profile.isError ? <ErrorState error={profile.error} onRetry={() => profile.refetch()} /> : (
            <>
              <ZoneNotice profile={profile.data} />
              <ProfileForm key={profile.dataUpdatedAt} profile={profile.data} submitLabel="Save Profile" />
            </>
          )}
        </Section>

        <Section id="goals" title="Goal" description="Your target weight, pace and how many workouts a week count toward your streak.">
          {goal.isPending ? <Loading /> : goal.isError ? <ErrorState error={goal.error} onRetry={() => goal.refetch()} /> : (
            <GoalForm key={goal.dataUpdatedAt} goal={goal.data} submitLabel="Save Goal" />
          )}
        </Section>

        <Section id="appearance" title="Appearance">
          <Segmented
            label="Theme"
            value={theme}
            onChange={(t) => {
              setTheme(t);
              setThemeState(t);
            }}
            options={[
              { value: "system", label: "System" },
              { value: "light", label: "Light" },
              { value: "dark", label: "Dark" },
            ]}
          />
        </Section>

        <Section id="data" title="Your data" description="Download everything you’ve logged. The JSON export includes your profile, weigh-ins, measurements, check-ins, workouts and templates.">
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <Button variant="secondary" loading={exporting === "/api/account/export"} onClick={() => exportFile("/api/account/export", "fittrack-export.json")}>
              <Download className="size-4" aria-hidden="true" />
              Export All (JSON)
            </Button>
            <Button variant="secondary" loading={exporting === "/api/weights/export.csv"} onClick={() => exportFile("/api/weights/export.csv", "weights.csv")}>
              <Download className="size-4" aria-hidden="true" />
              Export Weigh-ins (CSV)
            </Button>
          </div>
        </Section>

        <Section id="account" title="Account">
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <Button variant="secondary" onClick={logout}>
              Log Out
            </Button>
            <Button variant="danger" onClick={() => setDeleteOpen(true)}>
              Delete Account
            </Button>
          </div>
        </Section>
      </div>
      <DeleteAccountDialog open={deleteOpen} onClose={() => setDeleteOpen(false)} />
    </>
  );
}

/** The saved zone decides "today" and workout start times; offer a one-tap fix when it differs from the device's. */
export function ZoneNotice({ profile }: { profile: Profile }) {
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);
  const device = browserZone();
  if (!profile.timeZone || profile.timeZone === device) return null;

  const saved = `${profile.timeZone} (${zoneOffset(profile.timeZone)})`;
  const fix = async () => {
    setSaving(true);
    try {
      const { email: _e, age: _a, ...rest } = profile;
      const body: UpdateProfile = { ...rest, timeZone: device };
      await api.put<Profile>("/api/profile", body);
      await qc.invalidateQueries({ queryKey: ["profile"] });
      toast.success(`Time zone set to ${device}`);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };
  return (
    <div role="status" className="mb-5 flex flex-col gap-3 rounded-xl border border-warning/50 bg-warning/10 p-3 text-[0.8125rem] leading-relaxed sm:flex-row sm:items-center">
      <p className="flex flex-1 items-start gap-2">
        <Clock className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
        <span>
          Your device is in <strong>{device}</strong> but your profile uses <strong>{saved}</strong>. Switch?
        </span>
      </p>
      <Button size="sm" variant="secondary" loading={saving} onClick={fix}>
        Use {device}
      </Button>
    </div>
  );
}

function DeleteAccountDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<{ password: string }>({ defaultValues: { password: "" } });

  const close = () => {
    reset();
    onClose();
  };
  const onSubmit = handleSubmit(async ({ password }) => {
    if (!password) return setError("password", { message: "Enter your password to confirm." });
    try {
      await api.post("/api/account/delete", { password });
      await clearSession(qc);
      toast.success("Your account and all its data were deleted");
    } catch (e) {
      if (e instanceof ApiError && e.status === 400) setError("password", { message: "That password isn’t correct." });
      else toast.error(errorMessage(e));
    }
  });

  return (
    <Dialog open={open} onClose={close} title="Delete Account?">
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <p className="text-sm leading-relaxed text-muted">
          This permanently deletes your account and everything you’ve logged. It can’t be undone. Export your data first if you want a copy.
        </p>
        <Field label="Password" error={errors.password?.message}>
          <Input type="password" autoComplete="current-password" {...register("password")} />
        </Field>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={close}>
            Cancel
          </Button>
          <Button type="submit" variant="danger" loading={isSubmitting}>
            {isSubmitting ? "Deleting…" : "Delete Account"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
