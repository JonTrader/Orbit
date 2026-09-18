"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";
import Link from "next/link";
import { useEffect, useRef } from "react";

import {
  APP_PATH,
  SIGN_IN_PATH,
  SIGN_UP_PATH,
} from "@/lib/auth/paths";

import { LANDING_DESCRIPTION } from "./meta";

import "lenis/dist/lenis.css";
import "./landing.css";

if (typeof window !== "undefined") {
  gsap.registerPlugin(useGSAP, ScrollTrigger);
}

const SIGNED_IN_CTA = "Open your Space";

type LandingPageProps = {
  className?: string;
  /**
   * When set, the viewer is signed in: CTAs use this entry URL (Upcoming in
   * their entry Space) instead of Sign Up / Sign in.
   */
  enterHref?: string;
  /** Guest Sign Up target; defaults to SIGN_UP_PATH. May carry Invite continue. */
  signUpHref?: string;
  /** Guest Sign in target; defaults to SIGN_IN_PATH. May carry Invite continue. */
  signInHref?: string;
};

export function LandingPage({
  className,
  enterHref,
  signUpHref,
  signInHref,
}: LandingPageProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const signedIn = Boolean(enterHref);
  const primaryHref = enterHref ?? signUpHref ?? SIGN_UP_PATH;
  const primaryLabel = signedIn ? SIGNED_IN_CTA : "Sign Up";

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

      const magnets = [
        ...root.querySelectorAll<HTMLElement>("[data-magnet]"),
      ];
      const magnetCleanups: Array<() => void> = [];

      if (!reduced) {
        magnets.forEach((el) => {
          const onMove = (event: PointerEvent) => {
            const rect = el.getBoundingClientRect();
            const x = event.clientX - rect.left - rect.width / 2;
            const y = event.clientY - rect.top - rect.height / 2;
            el.style.transform = `translate(${x * 0.22}px, ${y * 0.28}px)`;
          };
          const onLeave = () => {
            el.style.transform = "translate(0, 0)";
          };
          el.addEventListener("pointermove", onMove);
          el.addEventListener("pointerleave", onLeave);
          magnetCleanups.push(() => {
            el.removeEventListener("pointermove", onMove);
            el.removeEventListener("pointerleave", onLeave);
            el.style.transform = "";
          });
        });
      }

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

      if (reduced || isMobile) {
        return () => {
          magnetCleanups.forEach((fn) => fn());
        };
      }

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

        const onLoad = () => ScrollTrigger.refresh();
        window.addEventListener("load", onLoad);

        return () => {
          window.removeEventListener("load", onLoad);
          magnetCleanups.forEach((fn) => fn());
          gsap.ticker.remove(onTick);
          lenis.destroy();
        };
      }

      return () => {
        magnetCleanups.forEach((fn) => fn());
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
      <div className="grain" aria-hidden="true" />

      <header className="top">
        <Link className="brand" href={APP_PATH}>
          Orbit
        </Link>
        <span className="tag">Spaces · Tasks · Monthlies</span>
        <Link className="cta magnet" href={primaryHref} data-magnet>
          {primaryLabel}
        </Link>
      </header>

      <section className="hero">
        <div className="wordmark" aria-hidden="true">
          <span>ORBIT</span>
          <span>ORBIT</span>
        </div>
        <h1>
          Stop treating rent like a grocery list.
          <br />
          <em>Stop treating yourself like a shared calendar.</em>
        </h1>
        <p className="lede">
          {LANDING_DESCRIPTION} Scroll for the proof.
        </p>
        <div className="hero-row">
          <Link className="cta large magnet" href={primaryHref} data-magnet>
            {primaryLabel}
          </Link>
          <div className="scroll-hint" aria-hidden="true">
            <span />
            Scroll
          </div>
        </div>
      </section>

      <section className="pin-stage" id="chapters">
        <div className="pin-inner">
          <div className="track">
            <article className="chapter" data-chapter="personal">
              <p className="ch-num">01 · Alone is valid</p>
              <h2>Personal Space</h2>
              <p>
                Not a trial household. A first-class orbit. Your Tasks and
                Monthlies stay private until you open the door.
              </p>
              <ul>
                <li>Default Space on first login</li>
                <li>Same Daily / Monthlies model</li>
                <li>Invite when you choose - not before</li>
              </ul>
            </article>
            <article className="chapter" data-chapter="shared">
              <p className="ch-num">02 · Together is explicit</p>
              <h2>Shared Space</h2>
              <p>
                Coordination is chosen. Invites, roles, assignees - never implied
                by a flat shared inbox.
              </p>
              <ul>
                <li>Owner · Editor · Read-only</li>
                <li>One timezone for due days</li>
                <li>Assignees without changing permissions</li>
              </ul>
            </article>
            <article className="chapter" data-chapter="daily">
              <p className="ch-num">03 · The day closes when you say</p>
              <h2>Daily</h2>
              <p>
                Day-to-day Tasks. Complete them and they stay done - no automatic
                midnight reset that pretends you failed.
              </p>
              <ul>
                <li>Optional due dates</li>
                <li>Optional assignees</li>
                <li>Hide completed by default</li>
              </ul>
            </article>
            <article className="chapter" data-chapter="monthlies">
              <p className="ch-num">04 · The month advances when you finish</p>
              <h2>Monthlies</h2>
              <p>
                Recurring obligations are not filtered Tasks. Finish this period;
                Orbit advances the next due date.
              </p>
              <ul>
                <li>A different kind of commitment</li>
                <li>Description when you need it</li>
                <li>Clamps to last day of short months</li>
              </ul>
            </article>
            <article className="chapter" data-chapter="upcoming">
              <p className="ch-num">05 · Look ahead. Don&apos;t add noise.</p>
              <h2>Upcoming</h2>
              <p>
                Read-only aggregate of what is coming due in the Active Space.
                Sight without the urge to dump more in.
              </p>
              <ul>
                <li>Monthlies by next due</li>
                <li>Tasks with due dates</li>
                <li>No quick-add here</li>
              </ul>
            </article>
          </div>
          <div className="progress" aria-hidden="true">
            <div className="progress-bar" />
          </div>
        </div>
      </section>

      <section className="slash" aria-hidden="true">
        <div className="slash-line" />
        <div className="slash-marquee">
          <div className="slash-track">
            <p>personal / shared / daily / monthlies / upcoming</p>
            <p>personal / shared / daily / monthlies / upcoming</p>
          </div>
        </div>
      </section>

      <section className="close" id="signup">
        {signedIn ? (
          <>
            <h2>You&apos;re one step ahead.</h2>
            <Link className="cta large magnet" href={primaryHref} data-magnet>
              {primaryLabel}
            </Link>
            <p className="back">Your Spaces are ready - jump back in.</p>
          </>
        ) : (
          <>
            <h2>Pick a Space. Keep the rest in motion.</h2>
            <Link className="cta large magnet" href={primaryHref} data-magnet>
              {primaryLabel}
            </Link>
            <p className="back">
              Already have an account?{" "}
              <Link href={signInHref ?? SIGN_IN_PATH}>Sign in</Link>
            </p>
          </>
        )}
      </section>
    </div>
  );
}
