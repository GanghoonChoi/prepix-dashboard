"use client";
import { use } from "react";
import { MembersContent } from "@/components/workspaces/members-content";
export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <MembersContent key={id} id={id} />;
}
