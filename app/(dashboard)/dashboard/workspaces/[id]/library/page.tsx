import { TeamLibrary } from "@/components/b2b/library";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{
    version?: string | string[];
    sourceProject?: string | string[];
  }>;
}) {
  const query = await searchParams;
  return (
    <TeamLibrary
      versionId={typeof query.version === "string" ? query.version : undefined}
      sourceProjectId={
        typeof query.sourceProject === "string"
          ? query.sourceProject
          : undefined
      }
    />
  );
}
