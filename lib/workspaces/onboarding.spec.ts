import { test } from "node:test";
import assert from "node:assert/strict";
import { parseInviteEmails, invitationStatus } from "./onboarding";
import type { Invitation } from "../api/services/workspace.service";
import { team } from "../i18n/strings/team";

test("mixed invitation draft preserves per-address errors and normalizes duplicates", () => {
  assert.deepEqual(
    parseInviteEmails(" A@example.com, a@example.com\ninvalid; b@example.com "),
    [
      { email: "a@example.com", status: "ready" },
      { email: "a@example.com", status: "duplicate" },
      { email: "invalid", status: "invalid_email" },
      { email: "b@example.com", status: "ready" },
    ]
  );
});
test("accepted and revoked invitations cannot look pending; interrupted sends become retryable", () => {
  const now = Date.now();
  const row: Invitation = {
    id: "id",
    email: "a@example.com",
    role: "editor",
    deliveryStatus: "sent",
    expiresAt: new Date(now + 1000).toISOString(),
    acceptedAt: null,
    revokedAt: null,
    lastSentAt: new Date(now - 61_000).toISOString(),
  };
  assert.equal(invitationStatus(row, now), "sent");
  assert.equal(
    invitationStatus({ ...row, deliveryStatus: "sending" }, now),
    "interrupted"
  );
  assert.equal(invitationStatus(row, now + 1001), "expired");
  assert.equal(
    invitationStatus(
      { ...row, revokedAt: new Date(now).toISOString() },
      now + 1001
    ),
    "revoked"
  );
  assert.equal(
    invitationStatus(
      { ...row, acceptedAt: new Date(now).toISOString() },
      now + 1001
    ),
    "accepted"
  );
});
test("all onboarding messages have matching Korean and English translations", () => {
  assert.deepEqual(Object.keys(team.ko).sort(), Object.keys(team.en).sort());
  for (const key of Object.keys(team.en) as (keyof typeof team.en)[]) {
    assert.deepEqual(
      team.en[key].match(/\{\w+\}/g)?.sort(),
      team.ko[key].match(/\{\w+\}/g)?.sort(),
      key
    );
  }
});
