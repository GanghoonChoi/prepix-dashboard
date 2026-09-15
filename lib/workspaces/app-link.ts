/**
 * The "앱에서 열기 / Open in app" deep link (F06.2).
 *
 * The grammar is fixed by the desktop side, which registers the `prepix://`
 * scheme in parallel:
 *
 *   prepix://open?workspace=<uuid>
 *
 * D14 removes the cloud "team project" — a workspace is one team video
 * archive, and projects exist only locally in the desktop app — so there is
 * nothing left to name here but the workspace. Nothing else rides in this URL:
 * no token, no path, no origin, no locale, no redirect. The app re-verifies
 * access with the server once it opens, so a token here would only be a
 * credential sitting in browser history, shell history, and screen-share
 * recordings for no benefit. A lowercase UUID only: a malformed id refuses
 * here, on this side, rather than reaching the OS as a link with no way to say
 * why it failed.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function isAppLinkId(value: string): boolean {
  return UUID.test(value);
}

export function buildAppOpenUrl(input: { workspaceId: string }): string | null {
  const { workspaceId } = input;
  if (!isAppLinkId(workspaceId)) return null;
  return `prepix://open?workspace=${workspaceId}`;
}
