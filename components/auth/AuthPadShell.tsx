import type { ReactNode } from "react";

import { AuthThemeProvider } from "./theme";

function HouseholdPad() {
  return (
    <div className="hidden place-items-center px-6 py-8 lg:grid lg:py-10" aria-hidden="true">
      <div
        className="relative w-full max-w-md min-h-88 rotate-[-1.1deg] px-6 pb-7 pl-12 pt-6 shadow-[0_1px_0_rgba(255,255,255,0.4)_inset,8px_14px_28px_rgba(42,39,35,0.12)] sm:min-h-136 sm:pl-[3.1rem] sm:pr-6"
        style={{
          background: `
            repeating-linear-gradient(transparent, transparent 31px, var(--auth-pad-rule) 31px, var(--auth-pad-rule) 32px),
            linear-gradient(90deg, transparent 2.4rem, var(--auth-pad-margin) 2.4rem, var(--auth-pad-margin) calc(2.4rem + 1px), transparent calc(2.4rem + 1px)),
            var(--auth-pad)
          `,
        }}
      >
        <div className="absolute bottom-6 left-2.5 top-6 flex flex-col justify-between">
          {Array.from({ length: 5 }, (_, i) => (
            <span
              key={i}
              className="size-2.5 rounded-full bg-(--auth-linen) shadow-[inset_0_1px_1px_rgba(42,39,35,0.2)]"
            />
          ))}
        </div>
        <div className="text-[1.75rem] font-bold tracking-[-0.03em] leading-none text-(--auth-ink)">
          Home
        </div>
        <div className="mb-4 mt-1 font-mono text-[0.62rem] uppercase tracking-[0.08em] text-(--auth-muted)">
          Maya · Jordan · Sam
        </div>
        <div className="mb-0.5 mt-3.5 text-[0.95rem] font-bold text-(--auth-clay)">
          Daily
        </div>
        <PadItem label="Take out recycling" meta="Maya" />
        <PadItem label="School forms" meta="done" done />
        <PadItem label="Call the dentist" meta="Jordan" />
        <div className="mb-0.5 mt-3.5 text-[0.95rem] font-bold text-(--auth-clay)">
          Monthlies
        </div>
        <PadItem label="Rent" meta="1st" />
        <PadItem label="Car insurance" meta="15th" />
        <PadItem label="Water bill" meta="20th" />
      </div>
    </div>
  );
}

function PadItem({
  label,
  meta,
  done = false,
}: {
  label: string;
  meta: string;
  done?: boolean;
}) {
  return (
    <div className="flex min-h-8 items-baseline gap-2 text-[1.05rem] text-(--auth-ink)">
      <span
        className={[
          "mt-0.5 size-[0.78rem] shrink-0 translate-y-[0.12rem] border-[1.5px] border-(--auth-ink)",
          done ? "bg-(--auth-ink)" : "",
        ].join(" ")}
      />
      <span className="font-medium">{label}</span>
      <span className="ml-auto font-mono text-[0.7rem] text-(--auth-muted)">
        {meta}
      </span>
    </div>
  );
}

export function AuthPadShell({ children }: { children: ReactNode }) {
  return (
    <AuthThemeProvider theme="pad">
      <div className="auth-pad min-h-screen bg-(--auth-linen) font-sans text-(--auth-ink)">
        <div className="grid min-h-screen lg:grid-cols-[1.05fr_0.95fr]">
          <HouseholdPad />
          <div className="flex min-h-screen flex-col items-center justify-center bg-(--auth-panel) px-5 py-10 sm:px-8 lg:items-start lg:border-l lg:border-[color-mix(in_srgb,var(--auth-ink)_8%,transparent)] lg:px-10 lg:py-12">
            <div className="w-full max-w-90">
              <div className="mb-6">
                <div className="text-[1.15rem] font-bold tracking-[-0.03em]">
                  Or<span className="text-(--auth-clay)">bit</span>
                </div>
                <div className="mt-0.5 font-mono text-[0.62rem] uppercase tracking-widest text-(--auth-muted)">
                  Household agenda
                </div>
              </div>
              {children}
            </div>
          </div>
        </div>
      </div>
    </AuthThemeProvider>
  );
}
