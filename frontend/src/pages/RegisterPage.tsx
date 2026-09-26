import { useState } from "react";
import { Link } from "react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { api, applyFieldErrors, errorMessage } from "../lib/api";
import { meKey } from "../lib/auth";
import type { Me } from "../lib/types";
import { Button, Field, Input } from "../components/ui";
import { AuthLayout } from "./AuthLayout";

// Mirrors the server's Identity password policy.
export const passwordSchema = z
  .string()
  .min(10, "Use at least 10 characters.")
  .regex(/[0-9]/, "Add at least one number.")
  .regex(/[a-z]/, "Add a lowercase letter.")
  .regex(/[A-Z]/, "Add an uppercase letter.");

const schema = z.object({
  displayName: z.string().trim().min(1, "Enter your name.").max(100),
  email: z.email("Enter a valid email address."),
  password: passwordSchema,
});
type Form = z.infer<typeof schema>;

export default function RegisterPage() {
  const qc = useQueryClient();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<Form>({ resolver: zodResolver(schema), defaultValues: { displayName: "", email: "", password: "" } });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      const me = await api.post<Me>("/api/auth/register", values);
      qc.setQueryData(meKey, me);
    } catch (e) {
      if (!applyFieldErrors(e, setError)) setFormError(errorMessage(e));
    }
  });

  return (
    <AuthLayout
      title="Create your account"
      footer={
        <>
          Already have an account?{" "}
          <Link to="/login" className="font-medium text-accent-fg underline-offset-4 hover:underline">
            Log in
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        {formError && (
          <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm font-medium text-danger">
            {formError}
          </p>
        )}
        <Field label="Name" error={errors.displayName?.message}>
          <Input autoComplete="name" placeholder="Alex…" {...register("displayName")} />
        </Field>
        <Field label="Email" error={errors.email?.message}>
          <Input type="email" autoComplete="email" spellCheck={false} placeholder="you@example.com" {...register("email")} />
        </Field>
        <Field
          label="Password"
          error={errors.password?.message}
          hint="At least 10 characters, with a number, an uppercase and a lowercase letter."
        >
          <Input type="password" autoComplete="new-password" {...register("password")} />
        </Field>
        <Button type="submit" loading={isSubmitting} className="w-full">
          {isSubmitting ? "Creating account…" : "Create Account"}
        </Button>
      </form>
    </AuthLayout>
  );
}
