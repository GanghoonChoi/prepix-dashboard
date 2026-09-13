import { redirect } from "next/navigation";
import { StartExperience } from "@/components/onboarding/start-experience";
export default async function StartPage({
  searchParams,
}: { searchParams: Promise<{ locale?: string }> }) {
  const { locale } = await searchParams;
  if (process.env.NEXT_PUBLIC_START_ONBOARDING !== "1")
    redirect(`https://www.prepix.ai${locale === "en" ? "" : "/ko"}/download`);
  return <StartExperience />;
}
