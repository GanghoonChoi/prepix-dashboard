import { LegalRedirect } from "@/components/legal-redirect";

// Canonical Refund Policy lives on the marketing homepage; redirect there.
export default function RefundPolicyPage() {
  return <LegalRedirect page="refund-policy" />;
}
