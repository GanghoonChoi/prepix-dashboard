import { test } from "node:test";
import assert from "node:assert/strict";
import { checkPgReturn, type PgIntent } from "./pg-return";
import type { BillingScope } from "./operations";

const scope: BillingScope = {
  origin: "http://127.0.0.1:3548",
  userId: "11111111-1111-4111-8111-111111111111",
  workspaceId: "22222222-2222-4222-8222-222222222222",
};
const order = { id: "33333333-3333-4333-8333-333333333333", providerOrderId: "b2b_x", amount: 110000 };
const intent: PgIntent = { scope, orderId: order.id, providerOrderId: order.providerOrderId, amount: order.amount };
const back = { orderId: "b2b_x", amount: 110000 };

test("a PG return confirms only for the order, amount and scope that started it", () => {
  assert.equal(checkPgReturn(intent, scope, order, back), "ok");
  assert.equal(checkPgReturn(intent, scope, order, { ...back, amount: 1 }), "mismatch");
  assert.equal(checkPgReturn(intent, scope, order, { ...back, orderId: "b2b_y" }), "mismatch");
  // Another account, team or service opened the return address.
  for (const other of [
    { ...scope, userId: "44444444-4444-4444-8444-444444444444" },
    { ...scope, workspaceId: "55555555-5555-4555-8555-555555555555" },
    { ...scope, origin: "https://other.example" },
  ])
    assert.equal(checkPgReturn(intent, other, order, back), "scope_mismatch");
  // Nothing was written down before leaving: nothing is confirmed.
  assert.equal(checkPgReturn(null, scope, order, back), "scope_mismatch");
  assert.equal(checkPgReturn({ ...intent, amount: 5 }, scope, order, back), "scope_mismatch");
});
