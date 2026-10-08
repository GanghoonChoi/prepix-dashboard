import type { ChangeProjectVisibility, Project } from "../api/generated/b2b";

// SOT: prepix-backend backend/docs/b2b-team-visibility.md
/** Which project surfaces this role may load. Only a working participant
 * (lead or editor) sees the project's people; a viewer of either kind
 * (team viewer or project viewer) watches the videos and the files. */
export function projectSurfaces(role: Project["role"]) {
  return { people: role !== "viewer" && role !== "reviewer" };
}

/** A folder is its videos and its files (2026-10-08 cleanup). 멤버 shows
 * only where a roster means something: a private folder, or the lead of a
 * team folder (who adds external people). `match` keeps 영상 lit on the
 * review pages under it. */
export function projectTabs(
  base: string,
  role: Project["role"],
  visibility: Project["visibility"],
) {
  const s = projectSurfaces(role);
  return [
    { href: base, ko: "영상", en: "Videos", match: `${base}/reviews` },
    { href: `${base}/files`, ko: "자료", en: "Files" },
    ...(s.people && (visibility === "private" || role === "lead")
      ? [{ href: `${base}/people`, ko: "멤버", en: "People" }]
      : []),
  ];
}

/** The lead's one toggle. Widening to "team" needs an explicit confirmation
 * and a reason (the server refuses with 422 otherwise); narrowing takes an
 * optional reason. */
export function visibilityChange(
  project: Pick<Project, "visibility" | "revision">,
): Omit<ChangeProjectVisibility, "requestKey"> {
  // One confirm click is the consent (2026-10-08); the audit trail names the
  // change, so nobody types a reason.
  if (project.visibility === "team")
    return { visibility: "private", revision: project.revision, reason: "비공개로 변경" };
  return { visibility: "team", revision: project.revision, confirmTeamWide: true, reason: "팀 전체 공개로 변경" };
}
