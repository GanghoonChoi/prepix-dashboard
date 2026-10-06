"use client";
import { use } from "react";
import { ProjectRequestView } from "@/components/b2b/requests";
export default function Page({
  params,
}: {
  params: Promise<{ projectId: string; requestId: string }>;
}) {
  const { projectId, requestId } = use(params);
  return (
    <ProjectRequestView
      key={`${projectId}:${requestId}`}
      projectId={projectId}
      requestId={requestId}
    />
  );
}
