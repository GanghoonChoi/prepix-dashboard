"use client";
import { use } from "react";
import { SharedReview } from "@/components/b2b/review-detail";
export default function Page({
  params,
}: {
  params: Promise<{ shareId: string }>;
}) {
  const { shareId } = use(params);
  return <SharedReview key={shareId} shareId={shareId} />;
}
