import { redirect } from "next/navigation";

// Retired 2026-10-08 (Figma-simple): seats follow members on 멤버, and your own
// devices are on the team home under 내 좌석.
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/dashboard/workspaces/${id}`);
}
