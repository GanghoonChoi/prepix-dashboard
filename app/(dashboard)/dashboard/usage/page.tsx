import { redirect } from "next/navigation";

/** 사용량 lives on 플랜과 결제 now; old links and bookmarks land there. */
export default function UsagePage() {
  redirect("/dashboard/plan");
}
