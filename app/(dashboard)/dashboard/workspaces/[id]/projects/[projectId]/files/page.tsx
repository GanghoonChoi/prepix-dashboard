"use client";
import { use } from "react";
import { ProjectFiles } from "@/components/b2b/files";
export default function Page({
  params,
}: { params: Promise<{ projectId: string }> }) {
  const { projectId } = use(params);
  return <ProjectFiles key={projectId} projectId={projectId} />;
}
