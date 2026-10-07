"use client";
import { use } from "react";
import { ProjectOverview } from "@/components/b2b/project";
export default function Page({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  return (
    <ProjectOverview
      key={use(params).projectId}
      projectId={use(params).projectId}
    />
  );
}
