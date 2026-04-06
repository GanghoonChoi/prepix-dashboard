import Link from "next/link";

export default function PrivacyPage() {
  return (
    <PolicyLayout title="Privacy Policy" lastUpdated="December 7, 2025">
      <Section title="1. Information We Collect">
        <p>
          We collect information that you provide directly to us when you create an account, use our services, or communicate with us. This may include:
        </p>
        <ul>
          <li>Name and email address</li>
          <li>Account credentials and authentication information</li>
          <li>Profile information and preferences</li>
          <li>Usage data and analytics</li>
          <li>Device and browser information</li>
        </ul>
      </Section>
      <Section title="2. How We Use Your Information">
        <p>
          We use the information we collect to provide, maintain, and improve our services. Specifically, we use your information to:
        </p>
        <ul>
          <li>Create and manage your account</li>
          <li>Provide customer support and respond to your requests</li>
          <li>Send you technical notices and security alerts</li>
          <li>Analyze usage patterns to improve our services</li>
          <li>Detect, prevent, and address technical issues</li>
          <li>Comply with legal obligations</li>
        </ul>
      </Section>
      <Section title="3. Information Sharing and Disclosure">
        <p>
          We do not sell, trade, or rent your personal information to third parties. We may share your information only in the following circumstances:
        </p>
        <ul>
          <li>With your consent or at your direction</li>
          <li>With service providers who assist in our operations (under strict confidentiality agreements)</li>
          <li>To comply with legal obligations or valid legal requests</li>
          <li>To protect the rights, property, or safety of Prepix Inc, our users, or others</li>
          <li>In connection with a merger, acquisition, or sale of assets</li>
        </ul>
      </Section>
      <Section title="4. Data Security">
        <p>
          We implement appropriate technical and organizational measures to protect your personal information against unauthorized access, alteration, disclosure, or destruction. However, no method of transmission over the Internet or electronic storage is 100% secure, and we cannot guarantee absolute security.
        </p>
      </Section>
      <Section title="5. Cookies and Tracking Technologies">
        <p>
          We use cookies and similar tracking technologies to track activity on our service and hold certain information. Cookies are files with small amount of data which may include an anonymous unique identifier. You can instruct your browser to refuse all cookies or to indicate when a cookie is being sent.
        </p>
      </Section>
      <Section title="6. Your Rights and Choices">
        <p>You have certain rights regarding your personal information:</p>
        <ul>
          <li>Access and receive a copy of your personal data</li>
          <li>Correct or update inaccurate information</li>
          <li>Request deletion of your personal information</li>
          <li>Object to or restrict certain processing activities</li>
          <li>Withdraw consent where processing is based on consent</li>
          <li>Data portability rights</li>
        </ul>
        <p>
          To exercise these rights, please contact us at the email address provided below.
        </p>
      </Section>
      <Section title="7. Data Retention">
        <p>
          We retain your personal information only for as long as necessary to fulfill the purposes outlined in this Privacy Policy, unless a longer retention period is required or permitted by law. When we no longer need your information, we will securely delete or anonymize it.
        </p>
      </Section>
      <Section title="8. Children&apos;s Privacy">
        <p>
          Our services are not intended for children under the age of 13. We do not knowingly collect personal information from children under 13. If you are a parent or guardian and believe your child has provided us with personal information, please contact us so we can delete such information.
        </p>
      </Section>
      <Section title="9. Changes to This Privacy Policy">
        <p>
          We may update our Privacy Policy from time to time. We will notify you of any changes by posting the new Privacy Policy on this page and updating the &quot;Last updated&quot; date. You are advised to review this Privacy Policy periodically for any changes.
        </p>
      </Section>
      <Section title="10. Contact Us">
        <p>
          If you have any questions about this Privacy Policy or our data practices, please contact us at:
        </p>
        <ContactBox>privacy@prepix.ai</ContactBox>
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
