import { test } from "node:test";
import assert from "node:assert/strict";
import { loginHref, signupHref } from "./auth-entry";
import { safeReturnTo } from "./return-to";

test("local authentication preserves the share destination; site authentication pins dashboard destinations to their origin", () => {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const previousSetting = process.env.NEXT_PUBLIC_AUTH_ON_SITE;
  const path = "/dashboard/review-shares/00000000-0000-4000-8000-000000000001";
  try {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: { location: { origin: "http://localhost:3501" } },
    });
    delete process.env.NEXT_PUBLIC_AUTH_ON_SITE;
    for (const entry of [loginHref, signupHref]) {
      const query = new URL(entry({ lang: "ko", returnTo: path }), "http://localhost:3501").searchParams;
      assert.equal(query.get("locale"), "ko");
      assert.equal(query.get("returnTo"), path);
      assert.equal(safeReturnTo(query.get("returnTo")), path);
    }
    process.env.NEXT_PUBLIC_AUTH_ON_SITE = "1";
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: { location: { origin: "https://dashboard.prepix.ai" } },
    });
    for (const entry of [loginHref, signupHref]) {
      const query = new URL(entry({ lang: "ko", returnTo: path }), "https://dashboard.prepix.ai").searchParams;
      assert.equal(query.get("returnTo"), `https://dashboard.prepix.ai${path}`);
      assert.equal(safeReturnTo(query.get("returnTo")), `https://dashboard.prepix.ai${path}`);
    }
  } finally {
    if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow);
    else Reflect.deleteProperty(globalThis, "window");
    if (previousSetting === undefined) delete process.env.NEXT_PUBLIC_AUTH_ON_SITE;
    else process.env.NEXT_PUBLIC_AUTH_ON_SITE = previousSetting;
  }
});
