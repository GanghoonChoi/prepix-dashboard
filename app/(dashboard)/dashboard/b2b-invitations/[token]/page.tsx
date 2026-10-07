"use client";
import { use } from "react";
import { AcceptInvitation } from "@/components/b2b/accept-invitation";
export default function Page({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  return <AcceptInvitation key={token} token={token} />;
}
