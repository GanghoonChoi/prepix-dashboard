/**
 * Which failures invalidate what is already on screen, and which do not.
 *
 * A refresh that fails does not mean the content is gone. Spec §5.1 requires
 * input, selection and transfer queues to survive an error, so a caller keeps
 * its last good response and shows a banner over it. Only a code that says the
 * content itself became invalid — the workspace disappeared, membership ended,
 * the feature was switched off — may clear it. Branch on the code, never on
 * "any failure": the 30s background poll and the focus refresh both land here,
 * and a three-second wifi drop must not unmount a half-typed invitation.
 */
const GONE = new Set([
  "WORKSPACE_NOT_FOUND",
  "PROJECT_NOT_FOUND",
  "WORKSPACE_MEMBER_SUSPENDED",
  "WORKSPACES_DISABLED",
  "TEAM_PROJECTS_DISABLED",
  "WORKSPACE_MANAGEMENT_DISABLED",
  // The grant behind the content ended rather than the content itself. The
  // backend raises these while a privileged panel is already painted — an admin
  // demoting someone, or removing them from one project — and leaving the rows
  // under a banner shows data the viewer may no longer read.
  "WORKSPACE_ADMIN_REQUIRED",
  "PROJECT_PERMISSION_DENIED",
  "ACCOUNT_UNAVAILABLE",
]);
// Keep identical to REVOKED in prepix/apps/desktop/src/renderer/src/pages/
// workspaces/state.ts, which adds only WORKSPACE_ACCOUNT_CHANGED (raised by the
// desktop's local IPC account guard). Both clients read the same codes from the
// same backend; a divergence means one blanks where the other keeps. Narrow
// flags such as TEAM_UPLOADS_UNAVAILABLE stay out — they withdraw one action,
// not the content.

export function contentGone(code: string) {
  return GONE.has(code);
}

/**
 * A capability probe answers one of two different questions when it fails.
 *
 * A 404 is an answer: this server is older than the feature, so the feature is
 * absent and there is nothing to retry. A timeout, a dropped connection or a
 * 5xx is not an answer at all — rendering those as "the team product does not
 * exist" hides the whole nav entry over a blip. Those get a retry instead.
 */
export function capabilityFailure(error: unknown): "absent" | "unreachable" {
  const status = (error as { response?: { status?: number } })?.response?.status;
  return typeof status === "number" && status < 500 ? "absent" : "unreachable";
}
