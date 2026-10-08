import { redirect } from "next/navigation";

// Retired 2026-10-08 (Figma-simple): files live in their projects.
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/dashboard/workspaces/${id}/projects`);
}
