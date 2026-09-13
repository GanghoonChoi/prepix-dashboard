"use client";
import { use, type ReactNode } from "react";
import { WorkspaceProvider } from "@/components/workspaces/workspace-context";
export default function Layout({
  params,
  children,
}: {
  params: Promise<{ id: string }>;
  children: ReactNode;
}) {
  const { id } = use(params);
  return (
    <WorkspaceProvider key={id} id={id}>
      {children}
    </WorkspaceProvider>
  );
}
