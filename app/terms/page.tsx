import { LegalRedirect } from "@/components/legal-redirect";

// Canonical Terms live on the marketing homepage; redirect there.
export default function TermsPage() {
  return <LegalRedirect page="terms-of-service" />;
}
