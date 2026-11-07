import Link from "next/link";
import { ArrowRight, Check, ShieldCheck } from "lucide-react";
import { PublicShell } from "@/components/layout/public-shell";
export default function HomePage() {
  return (
    <PublicShell>
      <main className="vp-landing-main">
        <section className="vp-landing-intro">
          <p className="vp-eyebrow">YOUR MONEY, IN YOUR HANDS</p>
          <h1>
            A clearer way
            <br />
            to buy. And resolve.
          </h1>
          <p>
            One place to review purchases, manage renewals, and find a fair next
            step when an order goes wrong.
          </p>
          <div className="vp-landing-actions">
            <Link className="vp-button" href="/login">
              Explore the workspace
              <ArrowRight size={18} />
            </Link>
            <Link className="vp-secondary" href="/register">
              Create an account
            </Link>
          </div>
          <div className="vp-landing-assurance">
            <ShieldCheck size={17} />
            <span>You review. You approve. Vela helps with the rest.</span>
          </div>
        </section>
        <section
          className="vp-landing-preview"
          aria-label="Demo workspace preview"
        >
          <div className="vp-landing-preview-kicker">
            <span>
              <i />
              YOUR VELA WORKSPACE
            </span>
            <span className="vp-public-status">Demo</span>
          </div>
          <h2>Every next step, in view.</h2>
          <p className="vp-preview-caption">Tracked purchases</p>
          <p className="vp-preview-amount">
            $134<span>.00</span>
          </p>
          <p className="vp-preview-period">October · Vela Market sample</p>
          <ol>
            {[
              [
                "Your purchase, understood.",
                "Review the item, price, and saved agreement.",
              ],
              [
                "Your renewal, your decision.",
                "Continue, snooze a reminder, or cancel.",
              ],
              [
                "Both sides of the story.",
                "Shared evidence. Clear options. Your approval.",
              ],
            ].map(([title, copy], i) => (
              <li key={title}>
                <span>0{i + 1}</span>
                <div>
                  <h3>{title}</h3>
                  <p>{copy}</p>
                </div>
                {i < 2 ? (
                  <Check size={17} aria-hidden="true" />
                ) : (
                  <ArrowRight size={17} aria-hidden="true" />
                )}
              </li>
            ))}
          </ol>
          <p className="vp-preview-note">
            No live payment, email, or AI connection in this prototype.
          </p>
        </section>
      </main>
      <section
        className="vp-landing-roles"
        aria-label="Three VelaPal workspaces"
      >
        {[
          [
            "For your everyday",
            "Purchases, subscriptions, private evidence, and a little help when you need it.",
          ],
          [
            "For your business",
            "Products, orders, payment visibility, and a thoughtful way to respond to customers.",
          ],
          [
            "For your operations",
            "Merchant reviews, scoped permissions, monitoring, and a traceable record of decisions.",
          ],
        ].map(([title, copy], i) => (
          <article key={title}>
            <span>0{i + 1}</span>
            <h2>{title}</h2>
            <p>{copy}</p>
          </article>
        ))}
      </section>
    </PublicShell>
  );
}
