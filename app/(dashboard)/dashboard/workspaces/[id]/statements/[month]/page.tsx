"use client";
import { use } from "react";
import { TeamStatementMonth } from "@/components/b2b/statements";
export default function Page({
  params,
}: {
  params: Promise<{ id: string; month: string }>;
}) {
  const { month } = use(params);
  return <TeamStatementMonth key={month} month={month} />;
}
