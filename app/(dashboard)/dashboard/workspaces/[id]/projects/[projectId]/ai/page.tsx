"use client";
import { use } from "react";
import { ProjectAiRun } from "@/components/b2b/ai-run";
export default function Page({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = use(params);
  return <ProjectAiRun key={projectId} projectId={projectId} />;
}
