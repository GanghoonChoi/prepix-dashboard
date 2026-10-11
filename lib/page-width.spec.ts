import { test } from "node:test";
import assert from "node:assert/strict";
import { pageWidth } from "./page-width";

const team = "/dashboard/workspaces/7f1c2e3a-0000-4000-8000-000000000001";

test("the review workspace takes the full width", () => {
  assert.equal(pageWidth(`${team}/projects/p1/reviews/4b2a6f0e-1111-4111-8111-111111111111`), "full");
  assert.equal(pageWidth("/dashboard/review-shares/abc"), "full");
});

test("forms and single-column reading pages are narrow", () => {
  for (const path of [
    "/dashboard/settings",
    "/dashboard/notifications",
    "/dashboard/invitations/tok",
    "/dashboard/b2b-invitations/tok",
    "/dashboard/workspaces/new",
    `${team}/settings`,
    `${team}/plan/settings`,
    `${team}/plan/orders/o1`,
    `${team}/statements/2026-10`,
  ])
    assert.equal(pageWidth(path), "narrow", path);
});

test("lists, grids and overviews are wide", () => {
  for (const path of [
    "/dashboard",
    "/dashboard/plan",
    "/dashboard/usage",
    "/dashboard/workspaces",
    team,
    `${team}/projects`,
    `${team}/projects/p1`,
    `${team}/projects/p1/reviews`,
    `${team}/members`,
    `${team}/media`,
    `${team}/plan`,
    `${team}/statements`,
  ])
    assert.equal(pageWidth(path), "wide", path);
});
