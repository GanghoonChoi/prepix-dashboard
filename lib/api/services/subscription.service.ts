import { apiClient } from "../client";

export type BillingInterval = "month" | "year";

export interface PlanPrice {
  interval: BillingInterval;
  currency: string;
  unitAmount: number;
  launchDiscountPercent?: number | null;
}

export interface CatalogPlan {
  id: string;
  displayName: string;
  status: "active" | "coming_soon";
  displayOrder: number;
  inferenceSecondsPerMonth: number;
  videosPerMonth: number;
  storageLimitBytes: number;
  prices: PlanPrice[];
}

export interface CurrentSubscription {
  // The ENTITLED tier (users.current_plan server-side) — what the account can
  // actually use. It is not always backed by a subscription: comps and promos
  // are granted directly, so `plan` can be paid while `manageable` is false.
  plan: string;
  status: string;
  // Whether a live Paddle subscription backs this plan, i.e. whether there is
  // anything to cancel or downgrade. False for granted tiers and for plans with
  // no subscription at all.
  manageable: boolean;
  currentPeriodStart?: string | null;
  currentPeriodEnd?: string | null;
  paddleSubscriptionId?: string | null;
  cancelledAt?: string | null;
  // Whether the immediate refund button should be offered (backend re-verifies
  // on submit — this is only the UX gate). Equivalent to refund.action ===
  // "self-serve"; kept because it is the older, narrower question.
  refundEligible: boolean;
  // Which of the policy's three bands this payment falls in, and therefore
  // which affordance to render. The rate is what the policy grants for an
  // UNUSED payment; a used one comes back as "none" with reason "used".
  refund: {
    // self-serve      refund it now
    // request-review  we file it and a person decides
    // contact-support inside 14 days, no change-of-mind refund, fault claims ok
    // pending         one is already filed — show its state, not a button
    // none            render nothing
    action: "self-serve" | "request-review" | "contact-support" | "pending" | "none";
    rate: "full" | "half" | "none";
    daysElapsed: number | null;
    reason?: string;
    pendingThreadId: string | null;
  };
}

export interface CheckoutResult {
  // Which merchant of record this checkout belongs to. Only "paddle" has an
  // in-page overlay; the others host their own page, so the client follows
  // checkoutUrl instead of handing the id to Paddle.js.
  provider: "paddle" | "creem" | "lemonsqueezy" | "tosspayments";
  // Server-created Paddle transaction the overlay opens (client-side creation
  // is blocked for this vendor, so the backend always pre-creates it), or the
  // hosted checkout's id for the other providers.
  transactionId: string;
  checkoutUrl: string;
  priceId: string;
  email: string;
  userId: string;
  plan: string;
  interval: BillingInterval;
  discountId?: string;
}

export const subscriptionService = {
  getCurrent: async (): Promise<CurrentSubscription> => {
    const response = await apiClient.get("/subscriptions/current");
    return response.data.data;
  },

  // The public catalog — single source of truth for tiers, prices and status.
  getPlans: async (): Promise<CatalogPlan[]> => {
    const response = await apiClient.get("/subscriptions/plans");
    return response.data.data;
  },

  checkout: async (
    planId: string,
    interval: BillingInterval = "month",
  ): Promise<CheckoutResult> => {
    const response = await apiClient.post("/subscriptions/checkout", {
      planId,
      interval,
    });
    return response.data.data;
  },

  changePlan: async (newPlanId: string, interval: BillingInterval = "month") => {
    const response = await apiClient.post("/subscriptions/change-plan", {
      newPlanId,
      interval,
    });
    return response.data.data;
  },

  cancel: async () => {
    const response = await apiClient.post("/subscriptions/cancel");
    return response.data.data;
  },

  refund: async (): Promise<{ message: string }> => {
    const response = await apiClient.post("/subscriptions/refund");
    return response.data.data;
  },

  // Files the request and notifies the team — no money moves here. Used for
  // the 50% band, annual plans, and anything else a person has to size.
  requestRefundReview: async (
    note?: string,
  ): Promise<{
    threadId: string;
    rate: string;
    daysElapsed: number;
    alreadyFiled: boolean;
    message: string;
  }> => {
    const response = await apiClient.post("/subscriptions/refund/review", { note });
    return response.data.data;
  },
};

// --- Refund request threads -------------------------------------------------
// A refund request is filed as a feedback thread, so its status and our reply
// come back through the feedback API. The dashboard has no feedback surface of
// its own, and a request whose outcome you can only read in the desktop app is
// a request the web user thinks vanished — so the plan page renders the one
// thread that matters to it.

export interface RefundThreadMessage {
  id: string;
  author: "user" | "team";
  authorName?: string;
  body: string;
  createdAt: string;
  readAt?: string;
}

export interface RefundThread {
  id: string;
  kind: string;
  status: "open" | "answered" | "closed";
  createdAt: string;
  lastMessageAt: string;
  unread: number;
  messages: RefundThreadMessage[];
}

export const refundThreadService = {
  // The threads endpoint returns every kind; the plan page wants the refund one.
  forRefund: async (threadId: string): Promise<RefundThread | null> => {
    const response = await apiClient.get("/feedback/threads");
    const threads: RefundThread[] = response.data.data ?? [];
    return threads.find((th) => th.id === threadId) ?? null;
  },

  reply: async (threadId: string, body: string): Promise<void> => {
    await apiClient.post(`/feedback/threads/${threadId}/messages`, { body });
  },

  markRead: async (threadId: string): Promise<void> => {
    await apiClient.post(`/feedback/threads/${threadId}/read`);
  },
};
