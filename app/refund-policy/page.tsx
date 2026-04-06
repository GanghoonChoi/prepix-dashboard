import Link from "next/link";

export default function RefundPolicyPage() {
  return (
    <PolicyLayout title="Refund Policy" lastUpdated="December 17, 2025">
      <Section title="Overview">
        <p>
          At Prepix Inc, operator of Prepix, we want you to be completely satisfied with your purchase. This Refund Policy outlines the conditions under which refunds may be requested and processed for our subscription services.
        </p>
        <p>
          Prepix uses Paddle.com as the Merchant of Record for processing payments. All transactions are processed through Paddle, and refunds are subject to both Prepix Inc&apos;s and Paddle&apos;s policies.
        </p>
      </Section>

      <Section title="Consumer Right to Cancel">
        <p>
          If you are a Consumer, you have the right to cancel your subscription and return the Product within <strong>14 days</strong> without giving any reason. The cancellation period will expire after 14 days from the day after completion of the transaction.
        </p>
        <p>
          To meet the cancellation deadline, it is sufficient that you send us your communication concerning your exercise of the cancellation right before the expiration of the 14-day period.
        </p>
        <p>
          <strong>Note:</strong> In respect of subscription services, your right to cancel is only present following the initial subscription and not upon each automatic renewal.
        </p>
      </Section>

      <Section title="Refund Eligibility">
        <p>This 14-day money-back guarantee applies to:</p>
        <ul>
          <li>First-time purchases of any subscription plan (Standard, Pro, or Ultra)</li>
          <li>Initial subscription period only (not applicable to renewals)</li>
          <li>Both monthly and yearly billing cycles</li>
        </ul>
        <p>To be eligible for a refund, the following conditions must be met:</p>
        <ul>
          <li>The refund request must be submitted within 14 days of the initial purchase date</li>
          <li>The request must be made through our official support channels</li>
          <li>You must provide your account email and transaction details</li>
          <li>The subscription must not have been previously refunded</li>
        </ul>
      </Section>

      <Section title="Refund Policy">
        <p>
          Refunds are provided at the sole discretion of Prepix Inc and on a case-by-case basis and may be refused. We will refuse a refund request if we find evidence of fraud, refund abuse, or other manipulative behavior that entitles us to deny the refund.
        </p>
        <p>
          This does not affect your rights as a Consumer in relation to Products which are not as described, faulty or not fit for purpose.
        </p>
      </Section>

      <Section title="Exception to the Right to Cancel">
        <p>Your right as a Consumer to cancel your order does not apply to:</p>
        <ul>
          <li>Digital content that you have started to download, stream or otherwise acquire</li>
          <li>Products which you have had the benefit of using</li>
          <li>Subscription renewals (monthly or yearly) - only initial purchases qualify for the 14-day cancellation right</li>
          <li>Accounts suspended or terminated due to Terms of Service violations</li>
        </ul>
      </Section>

      <Section title="How to Request a Refund">
        <p>
          To cancel your order and request a refund, you must inform Prepix Inc of your decision. To ensure immediate processing, please follow these steps:
        </p>
        <ol>
          <li>Contact our support team at <strong>support@prepix.ai</strong></li>
          <li>Include &quot;Refund Request&quot; in the subject line</li>
          <li>Provide your account email address</li>
          <li>Include your transaction ID or purchase date</li>
          <li>Briefly explain the reason for your refund request (optional for cancellations within 14 days)</li>
        </ol>
        <p>
          Our support team will review your request and respond within 2-3 business days. We will communicate acknowledgment of receipt of your cancellation request to you without delay.
        </p>
      </Section>

      <Section title="Effect of Cancellation">
        <p>If you cancel your subscription as permitted above:</p>
        <ul>
          <li>We will reimburse to you all payments received from you</li>
          <li>Reimbursement will be made without undue delay, and not later than 14 days after the day on which we are informed about your decision to cancel</li>
          <li>We will make the reimbursement using the same means of payment as you used for the initial transaction</li>
          <li>You will not incur any fees as a result of the reimbursement</li>
          <li>Your subscription will be immediately downgraded to the Free plan</li>
        </ul>
      </Section>

      <Section title="Subscription Cancellation">
        <p>
          You may cancel your subscription at any time through your account settings or by contacting support. If you wish to cancel your subscription, please contact us at least 48 hours before the end of the current billing period.
        </p>
        <p>Please note:</p>
        <ul>
          <li>Cancellations do not automatically result in a refund unless within the 14-day cancellation period</li>
          <li>Upon cancellation, you will retain access to your subscription features until the end of your current billing period</li>
          <li>Your cancellation will take effect at the next payment date</li>
          <li>After cancellation, your account will automatically revert to the Free plan</li>
          <li>There are no refunds on unused subscription periods outside the 14-day cancellation window</li>
        </ul>
      </Section>

      <Section title="Processing Time">
        <p>Once your refund request is approved:</p>
        <ul>
          <li>Refunds will be processed to the original payment method used for the purchase</li>
          <li>Processing time typically takes 5-10 business days, depending on your payment provider and Paddle&apos;s processing procedures</li>
          <li>You will receive an email confirmation once the refund has been initiated</li>
        </ul>
        <p>
          Please allow additional time for the refund to appear in your account, as this depends on your bank or payment provider&apos;s processing times.
        </p>
      </Section>

      <Section title="Sales Tax Refunds">
        <p>
          If you&apos;ve been charged sales tax (including VAT, GST, or other applicable taxes) on your purchase and are registered for sales tax in the country of purchase, you may be entitled to a refund of the sales tax amount if permitted by the laws applicable in such country.
        </p>
        <p>
          You must contact us within 60 days after completing the purchase to be eligible for a sales tax refund. This refund will only be processed upon the provision of a valid sales tax code for your country. All refund requests received after 60 days from the date of the transaction will not be processed.
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
