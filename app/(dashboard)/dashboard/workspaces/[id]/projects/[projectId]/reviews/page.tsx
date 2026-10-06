"use client";
import { use } from "react";
import { ProjectReviews } from "@/components/b2b/reviews";
export default function Page({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = use(params);
  return <ProjectReviews key={projectId} projectId={projectId} />;
}
