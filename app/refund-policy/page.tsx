import Link from "next/link";

export default function RefundPolicyPage() {
  return (
    <PolicyLayout title="Refund Policy" lastUpdated="April 6, 2026">
      <Section title="Overview">
        <p>
          At Prepix Inc, operator of Prepix, we want you to be completely satisfied with your purchase. This Refund Policy outlines the conditions under which refunds are processed for our subscription services.
        </p>
        <p>
          Prepix uses Paddle.com as the Merchant of Record for processing all payments. All transactions are handled by Paddle, and refunds are processed in accordance with Paddle&apos;s refund policy.
        </p>
      </Section>

      <Section title="14-Day Money-Back Guarantee">
        <p>
          We offer a <strong>14-day money-back guarantee</strong> on all subscription plans. If you are not satisfied with your purchase for any reason, you may request a full refund within 14 days of your purchase date — no questions asked.
        </p>
        <p>
          This guarantee applies to:
        </p>
        <ul>
          <li>All subscription plans (Standard, Pro, and Ultra)</li>
          <li>Both monthly and yearly billing cycles</li>
          <li>First-time purchases and subscription renewals</li>
        </ul>
      </Section>

      <Section title="How to Request a Refund">
        <p>
          To request a refund, please follow these steps:
        </p>
        <ol>
          <li>Contact our support team at <strong>support@prepix.ai</strong></li>
          <li>Include &quot;Refund Request&quot; in the subject line</li>
          <li>Provide your account email address</li>
          <li>Include your transaction ID or purchase date</li>
        </ol>
        <p>
          Our support team will process your refund request within 2-3 business days. We will send you a confirmation once the refund has been initiated.
        </p>
      </Section>

      <Section title="Effect of Refund">
        <p>Once your refund is processed:</p>
        <ul>
          <li>You will receive a full reimbursement of the payment amount</li>
          <li>Reimbursement will be made without undue delay, and not later than 14 days after we receive your refund request</li>
          <li>The refund will be issued to the original payment method used for the transaction</li>
          <li>You will not incur any fees as a result of the refund</li>
          <li>Your subscription will be downgraded to the Free plan</li>
        </ul>
      </Section>

      <Section title="Subscription Cancellation">
        <p>
          You may cancel your subscription at any time through your account settings or by contacting our support team.
        </p>
        <ul>
          <li>Upon cancellation, you will retain access to your subscription features until the end of your current billing period</li>
          <li>Your cancellation will take effect at the next payment date</li>
          <li>After cancellation, your account will automatically revert to the Free plan</li>
        </ul>
      </Section>

      <Section title="Processing Time">
        <p>Once your refund has been approved:</p>
        <ul>
          <li>Refunds will be processed to the original payment method</li>
          <li>Processing typically takes 5-10 business days, depending on your payment provider and Paddle&apos;s processing procedures</li>
          <li>You will receive an email confirmation once the refund has been initiated</li>
        </ul>
        <p>
          Please allow additional time for the refund to appear in your account, as this depends on your bank or payment provider&apos;s processing times.
        </p>
      </Section>

      <Section title="Consumer Rights">
        <p>
          If you are a Consumer, you will benefit from any mandatory provisions of the law of the country in which you are resident. Nothing in this Refund Policy affects your rights as a Consumer to rely on such mandatory provisions of local law.
        </p>
      </Section>

      <Section title="Contact Information">
        <p>
          If you have any questions about our Refund Policy or need assistance with a refund request, please contact us:
        </p>
        <ContactBox>support@prepix.ai</ContactBox>
        <p>
          We are committed to providing excellent customer service and will work with you to address any concerns you may have about your subscription.
        </p>
      </Section>
    </PolicyLayout>
  );
}

function PolicyLayout({ title, lastUpdated, children }: { title: string; lastUpdated: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <Link href="/" className="mb-8 inline-block text-sm text-muted hover:text-foreground">&larr; Back</Link>
      <h1 className="text-3xl font-bold text-foreground">{title}</h1>
      <p className="mt-2 text-sm text-muted">Last updated: {lastUpdated}</p>
      <div className="mt-10 space-y-8">{children}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted [&_ul]:ml-6 [&_ul]:list-disc [&_ul]:space-y-2 [&_ol]:ml-6 [&_ol]:list-decimal [&_ol]:space-y-2 [&_strong]:text-foreground">
        {children}
      </div>
    </section>
  );
}

function ContactBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-3 rounded-lg border border-border bg-surface p-4">
      <p className="font-mono text-sm text-foreground">{children}</p>
    </div>
  );
}
