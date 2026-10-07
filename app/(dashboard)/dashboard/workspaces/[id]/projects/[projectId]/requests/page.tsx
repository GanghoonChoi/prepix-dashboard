"use client";
import { use } from "react";
import { ProjectRequests } from "@/components/b2b/requests";
export default function Page({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = use(params);
  return <ProjectRequests key={projectId} projectId={projectId} />;
}
