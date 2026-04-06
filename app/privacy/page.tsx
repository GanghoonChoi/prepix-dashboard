import Link from "next/link";

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      <Link
        href="/"
        className="mb-8 inline-flex items-center gap-2 text-sm text-muted hover:text-foreground"
      >
        &larr; Back
      </Link>
      <h1 className="text-3xl font-bold text-foreground">Privacy Policy</h1>
      <p className="mt-4 text-sm text-muted">Last updated: April 2026</p>
      <div className="mt-8 space-y-6 text-sm leading-relaxed text-muted">
        <p>
          This Privacy Policy describes how Prepix collects, uses, and protects
          your personal information.
        </p>
        <h2 className="text-lg font-semibold text-foreground">
          1. Information We Collect
        </h2>
        <p>
          We collect information you provide directly (name, email, payment
          details) and usage data (features used, processing times).
        </p>
        <h2 className="text-lg font-semibold text-foreground">
          2. How We Use Your Information
        </h2>
        <p>
          We use your information to provide the service, process payments,
          communicate with you, and improve our product.
        </p>
        <h2 className="text-lg font-semibold text-foreground">
          3. Data Security
        </h2>
        <p>
          We implement industry-standard security measures to protect your data.
          However, no method of transmission is 100% secure.
        </p>
      </div>
    </div>
  );
}
