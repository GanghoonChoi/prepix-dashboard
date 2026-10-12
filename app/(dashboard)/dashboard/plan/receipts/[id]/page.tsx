"use client";

import { useParams } from "next/navigation";
import { Receipt } from "@/components/dashboard/receipt";
import { usePageTitle } from "@/lib/hooks/use-page-title";

export default function ReceiptPage() {
  const { id } = useParams<{ id: string }>();
  usePageTitle("영수증");
  return <Receipt id={id} />;
}
