import type { Lang } from "@/lib/i18n/config";

// Display names for every plan id, including hidden/grandfathered ones (used to
// label a user's current plan). Tier names are brand-ish and kept as-is in both
// languages. Prices, quotas, and which tiers are offered come from the backend
// catalog (/subscriptions/plans) — the single source of truth.
export const PLAN_NAMES: Record<string, string> = {
  free: "Free",
  student: "Student",
  creator: "Creator",
  premium: "Premium",
  pro: "Pro",
};

// Marketing copy per tier, per language. The backend owns prices/quotas/status;
// the frontend owns the localized feature bullets, keyed by plan id.
type PlanCopy = { description: string; features: string[] };

export const PLAN_COPY: Record<Lang, Record<string, PlanCopy>> = {
  en: {
    free: {
      description: "Get started with AI video editing.",
      features: [
        "60 min of AI processing / month",
        "Rough cut generation",
        "Outputs up to 5 min · 720p",
        "2 projects",
        "Community support",
      ],
    },
    student: {
      description: "Full features at a student price.",
      features: [
        "180 min of AI processing / month",
        "Outputs up to 15 min · 1080p, no watermark",
        "5 projects / month",
        "Requires student verification",
      ],
    },
    creator: {
      description: "Everything you need to edit at full speed.",
      features: [
        "600 min of AI processing / month",
        "Outputs up to 2 hours · 4K, no watermark",
        "Multi-angle editing",
        "Natural language search",
        "Premiere Pro & Final Cut export",
        "Priority processing",
      ],
    },
    premium: {
      description: "Done-for-you editing with a dedicated director.",
      features: [
        "Unlimited AI processing",
        "Source-to-final delivery",
        "Dedicated directing",
        "2–3 revision rounds",
        "Custom SLA",
      ],
    },
  },
  ko: {
    free: {
      description: "AI 영상 편집을 시작해보세요.",
      features: [
        "월 60분 AI 처리",
        "러프컷 생성",
        "최대 5분 · 720p 출력",
        "프로젝트 2개",
        "커뮤니티 지원",
      ],
    },
    student: {
      description: "학생 요금으로 모든 기능을.",
      features: [
        "월 180분 AI 처리",
        "최대 15분 · 1080p 출력, 워터마크 없음",
        "월 프로젝트 5개",
        "학생 인증 필요",
      ],
    },
    creator: {
      description: "빠른 편집에 필요한 모든 것.",
      features: [
        "월 600분 AI 처리",
        "최대 2시간 · 4K 출력, 워터마크 없음",
        "멀티앵글 편집",
        "자연어 검색",
        "Premiere Pro · Final Cut 내보내기",
        "우선 처리",
      ],
    },
    premium: {
      description: "전담 디렉터가 대신 편집해 드려요.",
      features: [
        "무제한 AI 처리",
        "촬영본부터 완성본까지 대행",
        "전담 디렉팅",
        "2~3회 수정",
        "맞춤 SLA",
      ],
    },
  },
};

// Format a catalog price. KRW is zero-decimal (amount is whole won); other
// currencies use the standard locale currency format.
export function formatPrice(currency: string, amount: number): string {
  if (currency === "KRW") return "₩" + amount.toLocaleString("ko-KR");
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(amount);
}
