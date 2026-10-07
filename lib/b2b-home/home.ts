import type { TeamHome } from "../api/generated/b2b";
import { localRefusal } from "../api/session";
export type HomeScope = { origin: string; userId: string; workspaceId: string };
export const homeScopeKey = (s: HomeScope) =>
  JSON.stringify([s.origin, s.userId, s.workspaceId]);
const fail = () => localRefusal("B2B_HOME_SCOPE_CHANGED");
export type HomeEnvironment = {
  origin: string;
  userId: string | null;
  pathname: string;
  signedIn: boolean;
};
export function assertHomeScope(
  scope: HomeScope,
  current: HomeEnvironment,
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  const path = `/dashboard/workspaces/${scope.workspaceId}`;
  if (
    !scope.userId ||
    !current.signedIn ||
    current.userId !== scope.userId ||
    current.origin !== scope.origin ||
    ![path, `${path}/`].includes(current.pathname)
  )
    throw fail();
}
/** Check both sides of the awaited response, even if the transport ignores abort. */
export async function readHome(
  scope: HomeScope,
  current: () => HomeEnvironment,
  send: () => Promise<TeamHome>,
  signal?: AbortSignal,
): Promise<TeamHome> {
  assertHomeScope(scope, current(), signal);
  try {
    const value = await send();
    assertHomeScope(scope, current(), signal);
    if (
      value.currentUserId !== scope.userId ||
      value.workspaceId !== scope.workspaceId
    )
      throw fail();
    return value;
  } catch (error) {
    assertHomeScope(scope, current(), signal);
    throw error;
  }
}
export function homeEnvironment(origin: string): HomeEnvironment {
  let userId: string | null = null;
  try {
    userId = JSON.parse(localStorage.getItem("userInfo") ?? "null")?.id ?? null;
  } catch {
    /* corrupt cache refuses private home */
  }
  return {
    origin,
    userId,
    pathname: window.location.pathname,
    signedIn: !!localStorage.getItem("accessToken"),
  };
}
