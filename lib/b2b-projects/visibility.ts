import type { ChangeProjectVisibility, Project } from "../api/generated/b2b";

// SOT: prepix-backend backend/docs/b2b-team-visibility.md
/** Which project surfaces this role may load. A team viewer (an internal
 * member who sees a team project without taking part) reads the overview, the
 * files list and reviews; every work surface answers 403 for them, and a 4xx
 * on a read clears the page as "access ended", so a viewer never asks. */
export function projectSurfaces(role: Project["role"]) {
  const participant = role !== "viewer";
  const worker = participant && role !== "reviewer";
  return {
    requests: participant,
    requestWork: participant,
    delivery: participant,
    publications: participant,
    people: worker,
    app: worker,
  };
}

/** A folder's pages as one tab row (2026-10-08), each only where
 * `projectSurfaces` already allows it. They used to be reached through a row
 * of buttons on the overview, a line of underlined links below the fold and a
 * "폴더 개요" back button on every sub-page — the reviews list only through a
 * "전체 보기" link. */
export function projectTabs(base: string, role: Project["role"]) {
  const s = projectSurfaces(role);
  return [
    { href: base, ko: "개요", en: "Overview" },
    { href: `${base}/files`, ko: "자료", en: "Files" },
    { href: `${base}/reviews`, ko: "영상 검토", en: "Reviews" },
    ...(s.requests ? [{ href: `${base}/requests`, ko: "요청사항", en: "Requests" }] : []),
    ...(s.people ? [{ href: `${base}/people`, ko: "참여자", en: "Participants" }] : []),
    ...(s.delivery ? [{ href: `${base}/delivery`, ko: "납품", en: "Delivery" }] : []),
  ];
}

/** The lead's one toggle. Widening to "team" needs an explicit confirmation
 * and a reason (the server refuses with 422 otherwise); narrowing takes an
 * optional reason. */
export function visibilityChange(
  project: Pick<Project, "visibility" | "revision">,
  input: { reason: string; confirmed: boolean },
): Omit<ChangeProjectVisibility, "requestKey"> {
  const reason = input.reason.trim();
  if (project.visibility === "team")
    return { visibility: "private", revision: project.revision, ...(reason ? { reason } : {}) };
  if (!input.confirmed) throw new Error("B2B_PROJECT_VISIBILITY_CONFIRMATION_REQUIRED");
  if (!reason) throw new Error("B2B_REASON_REQUIRED");
  return { visibility: "team", revision: project.revision, confirmTeamWide: true, reason };
}
