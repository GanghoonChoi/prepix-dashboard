"use client";
import { use } from "react";
import { ProjectReviewView } from "@/components/b2b/review-detail";
export default function Page({
  params,
}: {
  params: Promise<{ projectId: string; reviewId: string }>;
}) {
  const { projectId, reviewId } = use(params);
  return (
    <ProjectReviewView
      key={`${projectId}:${reviewId}`}
      projectId={projectId}
      reviewId={reviewId}
    />
  );
}
