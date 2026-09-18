"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";
import { useEffect, useRef, type ReactNode } from "react";

import "lenis/dist/lenis.css";

if (typeof window !== "undefined") {
  gsap.registerPlugin(useGSAP, ScrollTrigger);
}

type LandingEffectsProps = {
  className?: string;
  children: ReactNode;
};

/**
 * Client boundary for marketing motion: Lenis, ScrollTrigger pin/scrub, hero
 * intro, and `landing-active` on documentElement. Markup stays in the RSC parent.
 */
export function LandingEffects({ className, children }: LandingEffectsProps) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.documentElement.classList.add("landing-active");
    return () => {
      document.documentElement.classList.remove("landing-active");
    };
  }, []);

  useGSAP(
    () => {
      const root = rootRef.current;
      if (!root) return;

      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const isMobile = window.matchMedia("(max-width: 720px)").matches;

      gsap.fromTo(
        root.querySelectorAll(".hero h1, .hero .lede, .hero-row"),
        { y: 28, opacity: 0 },
        {
          y: 0,
          opacity: 1,
          duration: 0.9,
          stagger: 0.1,
          ease: "power2.out",
          clearProps: "transform",
        },
      );

      if (!reduced) {
        gsap.fromTo(
          root.querySelector(".slash-line"),
          { scaleX: 0 },
          {
            scaleX: 1,
            ease: "none",
            scrollTrigger: {
              trigger: root.querySelector(".slash"),
              start: "top 80%",
              end: "top 40%",
              scrub: true,
            },
          },
        );
      }

      if (reduced || isMobile) return;

      const lenis = new Lenis({
        autoRaf: false,
        lerp: 0.09,
      });

      lenis.on("scroll", ScrollTrigger.update);
      const onTick = (time: number) => {
        lenis.raf(time * 1000);
      };
      gsap.ticker.add(onTick);
      gsap.ticker.lagSmoothing(0);

      const track = root.querySelector<HTMLElement>(".track");
      const pinInner = root.querySelector<HTMLElement>(".pin-inner");
      const progress = root.querySelector<HTMLElement>(".progress-bar");
      const chapters = root.querySelector("#chapters");

      let onLoad: (() => void) | undefined;

      if (track && pinInner && progress && chapters) {
        const getScrollDistance = () =>
          Math.max(0, track.scrollWidth - window.innerWidth + 48);

        gsap.to(track, {
          x: () => -getScrollDistance(),
          ease: "none",
          scrollTrigger: {
            trigger: chapters,
            start: "top top",
            end: () => `+=${getScrollDistance()}`,
            pin: pinInner,
            scrub: 1,
            anticipatePin: 1,
            invalidateOnRefresh: true,
            onUpdate: (self) => {
              progress.style.width = `${self.progress * 100}%`;
            },
          },
        });

        onLoad = () => ScrollTrigger.refresh();
        window.addEventListener("load", onLoad);
      }

      return () => {
        if (onLoad) window.removeEventListener("load", onLoad);
        gsap.ticker.remove(onTick);
        lenis.destroy();
      };
    },
    { scope: rootRef },
  );

  return (
    <div
      ref={rootRef}
      className={["landing", className].filter(Boolean).join(" ")}
    >
      {children}
    </div>
  );
}
