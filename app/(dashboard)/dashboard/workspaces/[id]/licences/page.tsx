"use client";
import { TeamLicences } from "@/components/b2b/licences";
import { B2bError } from "@/components/b2b/shared";
import { useWorkspace } from "@/components/workspaces/workspace-context";
export default function Page() {
  const context = useWorkspace();
  if (!context?.b2b?.enrolled) return <B2bError code="B2B_TEAM_NOT_FOUND" />;
  return <TeamLicences />;
}
