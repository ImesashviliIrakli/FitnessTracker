import type { ReactNode } from "react";
import { Logo, LogoMark } from "../components/AppShell";

export function AuthLayout({ title, children, footer }: { title: string; children: ReactNode; footer: ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1fr_minmax(28rem,36rem)]">
      {/* Brand panel: the plate stripes are the one decorative move in the product. */}
      <div className="relative hidden overflow-hidden bg-[#161a26] p-12 text-[#e6e8f1] lg:flex lg:flex-col lg:justify-between">
        <span className="flex items-center gap-2 text-lg font-bold">
          <LogoMark className="size-7 text-[#9aa2ff]" />
          <span className="tracking-[0.18em] uppercase">Fittrack</span>
        </span>
        <div className="relative grid place-items-center py-8" aria-hidden="true">
          <span className="absolute size-80 rounded-full bg-[#8b93ff]/10 blur-3xl" />
          <LogoMark className="relative size-56 text-[#9aa2ff]" />
        </div>
        <p className="max-w-sm text-xl leading-snug font-semibold">
          Log the work. Watch the trend. Hit the number.
        </p>
      </div>

      <main className="flex flex-col justify-center px-5 py-12 sm:px-12">
        <div className="mx-auto w-full max-w-sm">
          <div className="mb-10 lg:hidden">
            <Logo />
          </div>
          <h1 className="text-[1.625rem] leading-tight font-bold tracking-[-0.02em] sm:text-3xl">{title}</h1>
          <div className="mt-8">{children}</div>
          <p className="mt-8 text-sm text-muted">{footer}</p>
        </div>
      </main>
    </div>
  );
}
