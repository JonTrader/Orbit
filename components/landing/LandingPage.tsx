import Link from "next/link";

import {
  APP_PATH,
  SIGN_IN_PATH,
  SIGN_UP_PATH,
} from "@/lib/auth/paths";

import { LandingEffects } from "./LandingEffects";
import { LANDING_DESCRIPTION } from "./meta";

import "./landing.css";

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
  const signedIn = Boolean(enterHref);
  const primaryHref = enterHref ?? signUpHref ?? SIGN_UP_PATH;
  const primaryLabel = signedIn ? SIGNED_IN_CTA : "Sign Up";

  return (
    <LandingEffects className={className}>
      <div className="grain" aria-hidden="true" />

      <header className="top">
        <Link className="brand" href={APP_PATH}>
          Orbit
        </Link>
        <span className="tag">Spaces · Tasks · Monthlies</span>
        <Link className="cta" href={primaryHref}>
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
          <Link className="cta large" href={primaryHref}>
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
            <Link className="cta large" href={primaryHref}>
              {primaryLabel}
            </Link>
            <p className="back">Your Spaces are ready - jump back in.</p>
          </>
        ) : (
          <>
            <h2>Pick a Space. Keep the rest in motion.</h2>
            <Link className="cta large" href={primaryHref}>
              {primaryLabel}
            </Link>
            <p className="back">
              Already have an account?{" "}
              <Link href={signInHref ?? SIGN_IN_PATH}>Sign in</Link>
            </p>
          </>
        )}
      </section>
    </LandingEffects>
  );
}
