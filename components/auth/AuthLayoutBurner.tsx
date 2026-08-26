import type { ReactNode } from "react";

import { AuthThemeProvider } from "./theme";

function BurnerRings() {
  return (
    <div
      className="pointer-events-none absolute aspect-square w-[min(38rem,92vw)] rounded-full border-2 border-[color-mix(in_srgb,var(--auth-copper)_78%,transparent)]"
      aria-hidden="true"
    >
      <span className="absolute inset-[12%] rounded-full border-2 border-[color-mix(in_srgb,var(--auth-copper)_58%,transparent)]" />
      <span className="absolute inset-[24%] rounded-full border-2 border-[color-mix(in_srgb,var(--auth-copper-hot)_72%,transparent)]" />
      <span className="auth-burner-glow absolute inset-[36%] rounded-full border-[3px] border-[color-mix(in_srgb,var(--auth-copper-hot)_70%,transparent)]" />
      {[0, 60, 120, 180, 240, 300].map((deg) => (
        <span
          key={deg}
          className="absolute left-1/2 top-1/2 h-[46%] w-0.5 origin-bottom bg-linear-to-t from-transparent to-[color-mix(in_srgb,var(--auth-copper)_35%,transparent)]"
          style={{ transform: `translate(-50%, -100%) rotate(${deg}deg)` }}
        />
      ))}
    </div>
  );
}

export function AuthLayoutBurner({ children }: { children: ReactNode }) {
  return (
    <AuthThemeProvider theme="burner">
      <div
        className="auth-burner relative min-h-screen overflow-hidden font-sans text-(--auth-butcher)"
        style={{
          background: `
            radial-gradient(1200px 700px at 50% 110%, #2c241c 0%, transparent 55%),
            radial-gradient(80% 50% at 50% 0%, #2a241e 0%, var(--auth-stone) 70%)
          `,
        }}
      >
        <div className="relative grid min-h-screen place-items-center px-4 py-10 sm:px-5 sm:py-14">
          <BurnerRings />
          <div className="relative w-full max-w-106 rounded-sm bg-(--auth-butcher) px-6 py-7 text-(--auth-ink) shadow-[0_1px_0_rgba(255,255,255,0.35)_inset,0_24px_50px_rgba(0,0,0,0.35)] sm:px-7 sm:py-8">
            <div
              className="pointer-events-none absolute inset-2 border border-[color-mix(in_srgb,var(--auth-ink)_8%,transparent)]"
              aria-hidden="true"
            />
            <div className="relative">
              <div className="text-[1.05rem] font-bold tracking-[-0.03em]">
                Or<span className="text-(--auth-copper)">bit</span>
              </div>
              <div className="mb-5 mt-0.5 font-mono text-[0.62rem] uppercase tracking-widest text-[color-mix(in_srgb,var(--auth-ink)_45%,var(--auth-ash))]">
                Household agenda
              </div>
              {children}
            </div>
          </div>
        </div>
      </div>
    </AuthThemeProvider>
  );
}
