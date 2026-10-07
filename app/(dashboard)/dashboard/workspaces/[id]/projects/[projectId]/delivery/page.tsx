"use client";
import { use } from "react";
import { ProjectDelivery } from "@/components/b2b/delivery";
export default function Page({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = use(params);
  return <ProjectDelivery projectId={projectId} />;
}
