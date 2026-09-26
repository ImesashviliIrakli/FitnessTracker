import { useState } from "react";
import { useNavigate } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { meKey } from "../lib/auth";
import type { Goal, Profile } from "../lib/types";
import { Logo } from "../components/AppShell";
import { GoalForm } from "../components/GoalForm";
import { ProfileForm } from "../components/ProfileForm";
import { ErrorState, Loading } from "../components/ui";

const steps = ["About you", "Starting point"] as const;

export default function OnboardingPage() {
  const [step, setStep] = useState(0);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const profile = useQuery({ queryKey: ["profile"], queryFn: () => api.get<Profile>("/api/profile") });
  const goal = useQuery({ queryKey: ["goals"], queryFn: () => api.get<Goal>("/api/goals") });

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:py-14">
      <Logo />
      <ol className="mt-10 flex gap-2" aria-label="Setup progress">
        {steps.map((s, i) => (
          <li key={s} className="flex-1" aria-current={i === step ? "step" : undefined}>
            <span className={`block h-1.5 rounded-full ${i <= step ? "bg-accent" : "bg-line"}`} />
            <span className={`mt-2 block text-[0.8125rem] leading-snug ${i === step ? "" : "text-muted"}`}>
              <span className="block text-[0.6875rem] text-muted">Step {i + 1} of {steps.length}</span>
              {s}
            </span>
          </li>
        ))}
      </ol>

      <h1 className="mt-8 text-[1.5rem] leading-tight font-bold tracking-[-0.02em] sm:text-3xl">{step === 0 ? "Set up your profile" : "Where you’re starting"}</h1>
      <p className="mt-2 max-w-prose text-sm leading-relaxed text-muted sm:text-base">
        {step === 0
          ? "These numbers drive your BMI, calorie target and weekly streaks. You can change them any time in Settings."
          : "Record today’s weight and what you’re working toward."}
      </p>

      <div className="mt-8">
        {profile.isPending || goal.isPending ? (
          <Loading />
        ) : profile.isError || goal.isError ? (
          <ErrorState error={profile.error ?? goal.error} onRetry={() => (profile.refetch(), goal.refetch())} />
        ) : step === 0 ? (
          <ProfileForm profile={profile.data} submitLabel="Continue" detectZone onSaved={() => setStep(1)} />
        ) : (
          <GoalForm
            goal={goal.data}
            withWeight
            submitLabel="Finish Setup"
            onSaved={async () => {
              await qc.refetchQueries({ queryKey: meKey });
              navigate("/", { replace: true });
            }}
          />
        )}
      </div>
    </div>
  );
}
