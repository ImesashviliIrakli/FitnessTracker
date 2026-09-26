import { useState } from "react";
import { Link } from "react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { api, errorMessage } from "../lib/api";
import { meKey } from "../lib/auth";
import type { Me } from "../lib/types";
import { Button, Field, Input } from "../components/ui";
import { AuthLayout } from "./AuthLayout";

const schema = z.object({
  email: z.email("Enter a valid email address."),
  password: z.string().min(1, "Enter your password."),
  rememberMe: z.boolean(),
});
type Form = z.infer<typeof schema>;

export default function LoginPage() {
  const qc = useQueryClient();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Form>({ resolver: zodResolver(schema), defaultValues: { email: "", password: "", rememberMe: true } });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      const me = await api.post<Me>("/api/auth/login", values);
      qc.setQueryData(meKey, me);
    } catch (e) {
      setFormError(errorMessage(e));
    }
  });

  return (
    <AuthLayout
      title="Log in"
      footer={
        <>
          New here?{" "}
          <Link to="/register" className="font-medium text-accent-fg underline-offset-4 hover:underline">
            Create an account
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
        <Field label="Email" error={errors.email?.message}>
          <Input type="email" autoComplete="email" spellCheck={false} placeholder="you@example.com" {...register("email")} />
        </Field>
        <Field label="Password" error={errors.password?.message}>
          <Input type="password" autoComplete="current-password" {...register("password")} />
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="size-4 accent-[var(--accent)]" {...register("rememberMe")} />
          Keep me logged in
        </label>
        <Button type="submit" loading={isSubmitting} className="w-full">
          {isSubmitting ? "Logging in…" : "Log In"}
        </Button>
      </form>
    </AuthLayout>
  );
}
