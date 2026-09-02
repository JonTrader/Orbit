interface SpaceOrbitProps {
  active?: boolean;
}

/** Empty circle by default; active Space shows an orange dot and accent ring. */
export function SpaceOrbit({ active = false }: SpaceOrbitProps) {
  return (
    <span
      aria-hidden
      className={[
        "grid size-[1.65rem] shrink-0 place-items-center rounded-full border-[1.5px] border-line bg-panel transition-[border-color,box-shadow]",
        active
          ? "border-accent shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent)_18%,transparent)]"
          : "",
      ].join(" ")}
    >
      <span
        className={[
          "size-[0.55rem] rounded-full transition-colors",
          active ? "bg-accent" : "bg-transparent",
        ].join(" ")}
      />
    </span>
  );
}
