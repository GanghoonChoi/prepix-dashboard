import Image from "next/image";
import Link from "next/link";
import {
  PLAN_PRICES,
  PLAN_DESCRIPTIONS,
  PLAN_FEATURES,
} from "@/lib/constants/data";

const PLANS = ["free", "standard", "pro", "ultra"] as const;
const PLAN_NAMES: Record<string, string> = {
  free: "Free", standard: "Standard", pro: "Pro", ultra: "Ultra",
};

const FEATURES = [
  {
    title: "AI Cut Detection",
    description: "Automatically detect and segment scenes, cuts, and transitions in your footage using multi-modal AI analysis.",
  },
  {
    title: "Smart Preview & Filtering",
    description: "Search, filter, and organize your clips by content, people, objects, and spoken words — before you even open your editor.",
  },
  {
    title: "Automated Pre-Editing",
    description: "Let AI prepare your timeline with rough cuts, structured bins, and tagged metadata so you can jump straight to creative work.",
  },
  {
    title: "Editor Integration",
    description: "Works directly with Adobe Premiere Pro. Export organized projects, markers, and sequences in industry-standard formats.",
  },
];

export default function HomePage() {
  return (
    <div className="min-h-dvh bg-background text-foreground">
      {/* Nav */}
      <nav className="flex items-center justify-between px-6 py-5 max-w-5xl mx-auto">
        <Link href="/" className="flex items-center gap-2">
          <Image src="/prepix-symbol.svg" alt="Prepix" width={22} height={22} />
          <Image src="/prepix-wordmark.svg" alt="Prepix" width={76} height={19} />
        </Link>
        <div className="flex items-center gap-6">
          <Link href="#pricing" className="text-sm text-muted hover:text-foreground transition-colors">Pricing</Link>
          <Link href="/login" className="text-sm font-medium text-foreground">Sign in</Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="px-6 pt-20 pb-24 max-w-3xl mx-auto text-center">
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-foreground leading-[1.1]">
          AI pre-editing assistant<br />for video editors
        </h1>
        <p className="mt-5 text-lg text-muted max-w-xl mx-auto leading-relaxed">
          Prepix analyzes your footage and structures it for faster editing.
          Cut detection, smart filtering, and automated organization — so you can focus on the creative work.
        </p>
        <div className="mt-8 flex items-center justify-center gap-4">
          <Link
            href="/signup"
            className="inline-flex items-center rounded-md bg-foreground px-5 py-2.5 text-sm font-medium text-background transition-opacity hover:opacity-90"
          >
            Get started free
          </Link>
          <Link
            href="https://prepix.ai"
            className="text-sm text-muted hover:text-foreground transition-colors"
            target="_blank"
            rel="noopener noreferrer"
          >
            Learn more &rarr;
          </Link>
        </div>
      </section>

      {/* Features */}
      <section className="px-6 py-20 max-w-5xl mx-auto">
        <h2 className="text-sm font-medium uppercase tracking-widest text-muted text-center">What you get</h2>
        <div className="mt-10 grid gap-6 sm:grid-cols-2">
          {FEATURES.map((f) => (
            <div key={f.title} className="rounded-lg border border-border p-6">
              <h3 className="text-base font-semibold text-foreground">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{f.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="px-6 py-20 max-w-5xl mx-auto">
        <div className="text-center">
          <h2 className="text-2xl font-bold tracking-tight text-foreground">Pricing</h2>
          <p className="mt-2 text-sm text-muted">Simple, transparent pricing. No hidden fees.</p>
        </div>

        <div className="mt-10 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {PLANS.map((planId) => {
            const price = PLAN_PRICES[planId].monthly;
            return (
              <div key={planId} className="flex flex-col rounded-lg border border-border p-5">
                <div className="flex-1">
                  <p className="text-sm font-semibold text-foreground">{PLAN_NAMES[planId]}</p>
                  <p className="mt-2">
                    <span className="text-2xl font-semibold tabular-nums text-foreground">${price}</span>
                    <span className="text-xs text-muted">/mo</span>
                  </p>
                  <p className="mt-2 text-xs leading-relaxed text-muted">{PLAN_DESCRIPTIONS[planId]}</p>
                  <ul className="mt-4 space-y-2">
                    {PLAN_FEATURES[planId].map((feat) => (
                      <li key={feat} className="flex items-start gap-2 text-xs text-muted">
                        <span className="mt-px text-foreground/40">&#8226;</span>
                        {feat}
                      </li>
                    ))}
                  </ul>
                </div>
                <Link
                  href="/signup"
                  className="mt-5 block w-full rounded-md border border-border py-2 text-center text-sm font-medium text-foreground transition-colors hover:bg-foreground/[0.06]"
                >
                  {planId === "free" ? "Get started" : "Start free trial"}
                </Link>
              </div>
            );
          })}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border px-6 py-8 max-w-5xl mx-auto">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-muted">&copy; {new Date().getFullYear()} Lasker Inc. All rights reserved.</p>
          <div className="flex gap-5 text-xs text-muted">
            <Link href="/terms" className="hover:text-foreground transition-colors">Terms</Link>
            <Link href="/privacy" className="hover:text-foreground transition-colors">Privacy</Link>
            <Link href="/refund-policy" className="hover:text-foreground transition-colors">Refund Policy</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
