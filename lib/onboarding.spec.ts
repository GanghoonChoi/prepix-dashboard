import { test } from "node:test";
import assert from "node:assert/strict";
import { parseEmails, readStartState, seatPlan, startHref } from "./onboarding";

const id = "0b6f7c1e-2a3b-4c5d-8e9f-0a1b2c3d4e5f";

test("reads intent, next and every step; unknown values fall back", () => {
  assert.deepEqual(readStartState(`?step=invite&workspace=${id}&intent=team`), {
    step: "invite",
    workspace: id,
    intent: "team",
    next: null,
  });
  assert.deepEqual(readStartState("?intent=personal&next=plan"), {
    step: "join",
    workspace: null,
    intent: "personal",
    next: "plan",
  });
  assert.deepEqual(readStartState("?step=nope&intent=company&next=x&workspace=../x"), {
    step: "join",
    workspace: null,
    intent: null,
    next: null,
  });
});

test("startHref round-trips and leaves defaults out", () => {
  const state = { step: "pay" as const, workspace: id, intent: "team" as const, next: null };
  assert.deepEqual(readStartState(new URL(startHref(state, "ko"), "http://x").search), state);
  assert.equal(
    startHref({ step: "join", workspace: null, intent: null, next: null }, "en"),
    "/start?locale=en",
  );
});

const product = {
  base: { seats: 3, supplyKrw: 387000 },
  extraSeat: { supplyKrw: 129000 },
  settlement: { vatBasisPoints: 1000 },
};

test("seats are you plus invitees, never below the base bundle", () => {
  assert.deepEqual(seatPlan(product, 0), { seats: 3, extraSeats: 0, supplyKrw: 387000, vatKrw: 38700, totalKrw: 425700 });
  assert.deepEqual(seatPlan(product, 2), { seats: 3, extraSeats: 0, supplyKrw: 387000, vatKrw: 38700, totalKrw: 425700 });
  assert.deepEqual(seatPlan(product, 4), { seats: 5, extraSeats: 2, supplyKrw: 645000, vatKrw: 64500, totalKrw: 709500 });
});

test("pasted addresses: split on commas, spaces and lines; drop yourself, repeats and people already invited", () => {
  assert.deepEqual(
    parseEmails("a@x.io, B@x.io\nme@x.io  a@x.io;nope c@x.io", "ME@x.io", ["c@x.io"]),
    { emails: ["a@x.io", "b@x.io"], invalid: ["nope"] },
  );
  assert.deepEqual(parseEmails("   ", "me@x.io", []), { emails: [], invalid: [] });
});
