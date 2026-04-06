import Link from "next/link";

export default function TermsPage() {
  return (
    <PolicyLayout title="Terms of Service" lastUpdated="December 7, 2025">
      <Section title="1. Acceptance of Terms">
        <p>
          By accessing and using Prepix (&quot;the Service&quot;), operated by Prepix Inc (&quot;the Company&quot;), you accept and agree to be bound by the terms and provision of this agreement. If you do not agree to abide by the above, please do not use this service.
        </p>
      </Section>
      <Section title="2. Use License">
        <p>
          Permission is granted to temporarily access the materials (information or software) on Prepix for personal, non-commercial transitory viewing only. This is the grant of a license, not a transfer of title, and under this license you may not:
        </p>
        <ul>
          <li>Modify or copy the materials</li>
          <li>Use the materials for any commercial purpose or for any public display</li>
          <li>Attempt to reverse engineer any software contained on Prepix</li>
          <li>Remove any copyright or other proprietary notations from the materials</li>
          <li>Transfer the materials to another person or &quot;mirror&quot; the materials on any other server</li>
        </ul>
      </Section>
      <Section title="3. User Accounts">
        <p>
          When you create an account with us, you must provide information that is accurate, complete, and current at all times. Failure to do so constitutes a breach of the Terms, which may result in immediate termination of your account on our Service.
        </p>
        <p>
          You are responsible for safeguarding the password that you use to access the Service and for any activities or actions under your password, whether your password is with our Service or a third-party service.
        </p>
      </Section>
      <Section title="4. Intellectual Property">
        <p>
          The Service and its original content, features, and functionality are and will remain the exclusive property of Prepix Inc and its licensors. The Service is protected by copyright, trademark, and other laws of both the United States and foreign countries.
        </p>
      </Section>
      <Section title="5. Termination">
        <p>
          We may terminate or suspend your account immediately, without prior notice or liability, for any reason whatsoever, including without limitation if you breach the Terms. Upon termination, your right to use the Service will immediately cease.
        </p>
      </Section>
      <Section title="6. Limitation of Liability">
        <p>
          In no event shall Prepix Inc, nor its directors, employees, partners, agents, suppliers, or affiliates, be liable for any indirect, incidental, special, consequential or punitive damages, including without limitation, loss of profits, data, use, goodwill, or other intangible losses, resulting from your access to or use of or inability to access or use the Service.
        </p>
      </Section>
      <Section title="7. Changes to Terms">
        <p>
          We reserve the right, at our sole discretion, to modify or replace these Terms at any time. If a revision is material we will try to provide at least 30 days&apos; notice prior to any new terms taking effect. What constitutes a material change will be determined at our sole discretion.
        </p>
      </Section>
      <Section title="8. Contact Information">
        <p>If you have any questions about these Terms, please contact us at:</p>
        <ContactBox>support@prepix.ai</ContactBox>
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
