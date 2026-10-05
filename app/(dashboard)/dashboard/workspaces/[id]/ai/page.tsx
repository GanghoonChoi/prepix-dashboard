"use client";
import { TeamAiUsage } from "@/components/b2b/ai-usage";
import { B2bError } from "@/components/b2b/shared";
import { useWorkspace } from "@/components/workspaces/workspace-context";
export default function Page() {
  const context = useWorkspace();
  if (!context?.b2b?.enrolled) return <B2bError code="B2B_TEAM_NOT_FOUND" />;
  return <TeamAiUsage />;
}
