"use client";
import { use } from "react";
import { ProjectParticipants } from "@/components/b2b/project";
export default function Page({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  return (
    <ProjectParticipants
      key={use(params).projectId}
      projectId={use(params).projectId}
    />
  );
}
