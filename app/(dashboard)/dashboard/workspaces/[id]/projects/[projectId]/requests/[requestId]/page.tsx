import { redirect } from "next/navigation";

// Retired 2026-10-08 (Figma-simple): the project's videos are the one place
// for this now. The address still resolves for old links and notifications.
export default async function Page({
  params,
}: {
  params: Promise<{ id: string; projectId: string }>;
}) {
  const { id, projectId } = await params;
  redirect(`/dashboard/workspaces/${id}/projects/${projectId}`);
}
