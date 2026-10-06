"use client";
import { use } from "react";
import { ProjectPublications } from "@/components/b2b/publications";
export default function Page({ params, searchParams }: { params: Promise<{ projectId: string }>; searchParams: Promise<{ publicationId?: string }> }) {
  const { projectId } = use(params);
  const { publicationId } = use(searchParams);
  return <ProjectPublications projectId={projectId} publicationId={publicationId} />;
}
