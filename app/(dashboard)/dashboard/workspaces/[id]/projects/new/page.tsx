import { redirect } from "next/navigation";

// Retired 2026-10-09: a team project is made by sharing an app project from
// the app (one team project per app project), never on the web.
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/dashboard/workspaces/${id}/projects`);
}
