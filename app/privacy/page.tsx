import { LegalRedirect } from "@/components/legal-redirect";

// Canonical Privacy Policy lives on the marketing homepage; redirect there.
export default function PrivacyPage() {
  return <LegalRedirect page="privacy-policy" />;
}
