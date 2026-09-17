import { apiClient } from "../client";

export type OrganizationRole = "owner" | "admin" | "billing" | "member";

export type OrganizationRow = {
  id: string;
  name: string;
  slug: string;
  seatLimit: number;
  role: OrganizationRole;
  createdAt: string;
};

export type OrganizationMember = {
  userId: string;
  role: OrganizationRole;
  email: string;
  name: string | null;
  joinedAt: string;
};

export type OrganizationWorkspace = {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  members: number;
};

export type OrganizationDetail = {
  organization: { id: string; name: string; slug: string; seatLimit: number };
  role: OrganizationRole;
  canManage: boolean;
  /**
   * Whether this account may see billing. The SERVER decides — an admin runs
   * the team without being handed the card, and a client that re-derives that
   * from a role string gets to be wrong about it on its own.
   */
  canManageBilling: boolean;
  currentUserId: string;
  /**
   * The one cost this layer genuinely incurs today, so the only figure the
   * billing screen may state as fact. `limit` is the per-workspace cap times
   * the number of workspaces, which is how the bytes actually behave.
   */
  storage: {
    used: number;
    reserved: number;
    limit: number;
    perWorkspaceLimit: number;
  };
  members: OrganizationMember[];
  workspaces: OrganizationWorkspace[];
};

const e = encodeURIComponent;

// Two unwraps, not one: the API wraps every payload in `{ data }` and axios
// wraps the response in `.data` again. Reading it once yields the envelope,
// and the first thing that touches a field on it throws.
const get = async <T>(path: string) =>
  (await apiClient.get<{ data: T }>(path, { timeout: 15_000 })).data.data;
const post = async <T = unknown>(path: string, body?: unknown) =>
  (await apiClient.post<{ data: T }>(path, body, { timeout: 30_000 })).data
    .data;

export const organizationService = {
  list: () => get<{ organizations: OrganizationRow[] }>("/organizations"),
  detail: (id: string) => get<OrganizationDetail>(`/organizations/${e(id)}`),
  rename: (id: string, name: string) =>
    post<{ status: "updated" }>(`/organizations/${e(id)}/settings`, { name }),
  addMember: (
    id: string,
    email: string,
    role: Exclude<OrganizationRole, "owner">,
  ) =>
    post<{ status: "added" | "no_account" | "already_member" }>(
      `/organizations/${e(id)}/members`,
      { email, role },
    ),
  changeMember: async (
    id: string,
    userId: string,
    role: Exclude<OrganizationRole, "owner"> | "remove",
  ) => {
    const result = await post<{ status: "updated" | "removed" }>(
      `/organizations/${e(id)}/members/${e(userId)}`,
      { role },
    );
    // Removing somebody from the organisation removes them from its
    // workspaces too, so anything showing a workspace roster is now stale.
    if (typeof window !== "undefined")
      window.dispatchEvent(new Event("workspaces:changed"));
    return result;
  },
};
