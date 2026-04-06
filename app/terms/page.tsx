import Link from "next/link";

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      <Link
        href="/"
        className="mb-8 inline-flex items-center gap-2 text-sm text-muted hover:text-foreground"
      >
        &larr; Back
      </Link>
      <h1 className="text-3xl font-bold text-foreground">Terms of Service</h1>
      <p className="mt-4 text-sm text-muted">Last updated: April 2026</p>
      <div className="mt-8 space-y-6 text-sm leading-relaxed text-muted">
        <p>
          Welcome to Prepix. By accessing or using our service, you agree to be
          bound by these Terms of Service. Please read them carefully.
        </p>
        <h2 className="text-lg font-semibold text-foreground">
          1. Acceptance of Terms
        </h2>
        <p>
          By creating an account or using Prepix, you agree to these terms and
          our Privacy Policy. If you do not agree, do not use the service.
        </p>
        <h2 className="text-lg font-semibold text-foreground">
          2. Use of Service
        </h2>
        <p>
          You may use Prepix for lawful purposes only. You are responsible for
          all activity that occurs under your account.
        </p>
        <h2 className="text-lg font-semibold text-foreground">
          3. Subscriptions & Billing
        </h2>
        <p>
          Paid features are billed on a recurring basis. You can cancel at any
          time; access continues until the end of the billing period.
        </p>
      </div>
    </div>
  );
}
