import type { Invitation } from "../api/services/workspace.service";

export function parseInviteEmails(raw: string) {
  const seen = new Set<string>();
  return raw
    .split(/[,;\n]+/)
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean)
    .map((email) => {
      const status = seen.has(email)
        ? "duplicate"
        : email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
        ? "invalid_email"
        : "ready";
      seen.add(email);
      return { email, status };
    });
}

export function invitationStatus(
  invitation: Invitation,
  now = Date.now()
): string {
  if (invitation.acceptedAt) return "accepted";
  if (invitation.revokedAt) return "revoked";
  if (new Date(invitation.expiresAt).getTime() <= now) return "expired";
  // A request interrupted between reservation and delivery can be retried.
  if (
    invitation.deliveryStatus === "sending" &&
    now - new Date(invitation.lastSentAt).getTime() >= 60_000
  )
    return "interrupted";
  return invitation.deliveryStatus;
}

export function workspaceError(error: unknown): string {
  const response = (
    error as { response?: { status?: number; data?: { message?: string } } }
  )?.response;
  const message = response?.data?.message;
  if (message && /^[A-Z_]+$/.test(message)) return message;
  if (response?.status === 429) return "RATE_LIMIT";
  if (response?.status === 404) return "WORKSPACE_NOT_FOUND";
  return "REQUEST_FAILED";
}
