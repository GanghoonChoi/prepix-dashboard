"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useWorkspace } from "@/components/workspaces/workspace-context";

/** 결제 정보 joined the plan page (2026-10-12). Old links and card-window
 * returns land there with their query intact. */
export default function Page() {
  const { data } = useWorkspace()!;
  const router = useRouter();
  useEffect(() => {
    router.replace(`/dashboard/workspaces/${data.workspace.id}/plan${window.location.search}`);
  }, [router, data.workspace.id]);
  return null;
}
