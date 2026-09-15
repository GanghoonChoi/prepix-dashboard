/**
 * The "앱에서 열기 / Open in app" deep link (F06.2).
 *
 * The grammar is fixed by the desktop side, which registers the `prepix://`
 * scheme in parallel:
 *
 *   prepix://open?workspace=<uuid>&project=<uuid>[&version=<uuid>]
 *
 * Nothing rides in this URL except the ids that name what to open — no token,
 * no path, no origin, no locale, no redirect. The app re-verifies access with
 * the server once it opens, so a token here would only be a credential sitting
 * in browser history, shell history, and screen-share recordings for no
 * benefit. Lowercase UUIDs only: a malformed id refuses here, on this side,
 * rather than reaching the OS as a link with no way to say why it failed.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function isAppLinkId(value: string): boolean {
  return UUID.test(value);
}

export function buildAppOpenUrl(input: {
  workspaceId: string;
  projectId: string;
  versionId?: string;
}): string | null {
  const { workspaceId, projectId, versionId } = input;
  if (!isAppLinkId(workspaceId) || !isAppLinkId(projectId)) return null;
  if (versionId !== undefined && !isAppLinkId(versionId)) return null;
  const params = new URLSearchParams({
    workspace: workspaceId,
    project: projectId,
  });
  if (versionId) params.set("version", versionId);
  return `prepix://open?${params.toString()}`;
}
