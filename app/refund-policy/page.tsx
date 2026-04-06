import Link from "next/link";

export default function RefundPolicyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      <Link
        href="/"
        className="mb-8 inline-flex items-center gap-2 text-sm text-muted hover:text-foreground"
      >
        &larr; Back
      </Link>
      <h1 className="text-3xl font-bold text-foreground">Refund Policy</h1>
      <p className="mt-4 text-sm text-muted">Last updated: April 2026</p>
      <div className="mt-8 space-y-6 text-sm leading-relaxed text-muted">
        <p>
          We want you to be satisfied with Prepix. This policy outlines our
          refund terms.
        </p>
        <h2 className="text-lg font-semibold text-foreground">
          1. Subscription Refunds
        </h2>
        <p>
          You may request a full refund within 7 days of your initial purchase.
          After 7 days, refunds are prorated based on remaining time.
        </p>
        <h2 className="text-lg font-semibold text-foreground">
          2. How to Request a Refund
        </h2>
        <p>
          Contact our support team at support@prepix.ai with your account email
          and reason for the refund request.
        </p>
        <h2 className="text-lg font-semibold text-foreground">
          3. Processing Time
        </h2>
        <p>
          Refunds are typically processed within 5-10 business days and will
          appear on your original payment method.
        </p>
      </div>
    </div>
  );
}
