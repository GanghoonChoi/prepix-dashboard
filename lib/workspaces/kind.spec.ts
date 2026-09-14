import { test } from "node:test";
import assert from "node:assert/strict";
import { isPersonal, personalFirst, seatFigures, workspaceKind } from "./kind";

test("workspace kind comes from the server, and an absent type is a team", () => {
  assert.equal(workspaceKind({ type: "personal" }), "personal");
  assert.equal(workspaceKind({ type: "team" }), "team");
  // The whole point of the fallback: never guess a workspace into `personal`,
  // because that takes its members tab, invitations and seats away.
  assert.equal(workspaceKind({}), "team");
  assert.equal(workspaceKind({ type: "PERSONAL" }), "team");
  assert.equal(isPersonal({ type: "personal" }), true);
  assert.equal(isPersonal({}), false);
});

test("personal sorts first and teams keep the order the server sent", () => {
  assert.deepEqual(
    personalFirst([
      { id: "t1", type: "team" },
      { id: "t2", type: "team" },
      { id: "p", type: "personal" },
      { id: "t3" },
    ]).map((row) => row.id),
    ["p", "t1", "t2", "t3"]
  );
});

type Detail = Parameters<typeof seatFigures>[0];

const detail = (seats: Detail["seats"] = undefined as never): Detail => ({
  workspace: { seatLimit: 10 },
  seats:
    seats === (undefined as never)
      ? {
          limit: 10,
          activeMembers: 3,
          pendingInvitations: 2,
          suspendedMembers: 1,
          freeReviewers: 4,
          remaining: 5,
        }
      : seats,
  members: [
    { role: "owner", suspendedAt: null },
    { role: "admin", suspendedAt: null },
    { role: "editor", suspendedAt: null },
    { role: "editor", suspendedAt: "2026-09-01T00:00:00.000Z" },
    // A reviewer is free (D01), so suspending one changes no paid-seat figure.
    { role: "reviewer", suspendedAt: "2026-09-01T00:00:00.000Z" },
    { role: "reviewer", suspendedAt: null },
    { role: "reviewer", suspendedAt: null },
    { role: "reviewer", suspendedAt: null },
  ],
});

test("a personal workspace has no seat figures at all, not zeroed ones", () => {
  // "0 of 0 seats, 0 remaining" still invites the reader to reason about seats
  // in a place that has none, so the whole block must be absent.
  assert.equal(seatFigures(detail(null)), null);
});

test("seats are separate figures and an unaccepted invitation is one of them", () => {
  assert.deepEqual(seatFigures(detail()), {
    limit: 10,
    active: 3,
    invited: 2,
    suspended: 1,
    reviewers: 4,
    remaining: 5,
  });
  // The Dropbox trap, stated as an assertion: no figure here is a sum that can
  // hide a seat a pending invitation is holding. If this ever collapses back
  // into one total, `remaining` starts agreeing with "limit minus active".
  const figures = seatFigures(detail())!;
  assert.notEqual(figures.remaining, figures.limit - figures.active);
  assert.equal(
    figures.remaining,
    figures.limit - figures.active - figures.invited
  );
});

test("revoking the invitations frees exactly the seats they were holding", () => {
  assert.deepEqual(
    seatFigures(
      detail({
        limit: 10,
        activeMembers: 3,
        pendingInvitations: 0,
        suspendedMembers: 1,
        freeReviewers: 4,
        remaining: 7,
      })
    ),
    { limit: 10, active: 3, invited: 0, suspended: 1, reviewers: 4, remaining: 7 }
  );
});

test("a server older than D13 still yields real numbers, derived not guessed", () => {
  // `{ used, reserved }` was the shape before the split landed. Suspended and
  // reviewer counts come off the member list so this reports facts, not zeros.
  assert.deepEqual(seatFigures(detail({ used: 3, reserved: 2 })), {
    limit: 10,
    active: 3,
    invited: 2,
    suspended: 1,
    reviewers: 4,
    remaining: 5,
  });
  assert.equal(
    seatFigures(detail({ used: 9, reserved: 9 }))!.remaining,
    0,
    "remaining is floored, never negative"
  );
});
