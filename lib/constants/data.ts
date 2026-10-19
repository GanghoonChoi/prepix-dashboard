import type { Lang } from "@/lib/i18n/config";

// Display names for every plan id, including hidden/grandfathered ones (used to
// label a user's current plan). Tier names are brand-ish and kept as-is in both
// languages. Prices, quotas, and which tiers are offered come from the backend
// catalog (/subscriptions/plans) — the single source of truth.
export const PLAN_NAMES: Record<string, string> = {
  free: "Free",
  student: "Student",
  light: "Light",
  creator: "Creator",
  premium: "Premium",
  pro: "Pro",
};

// How each billing status is labelled wherever a plan's state is shown. Shared
// so the home tile and the plan page can never disagree — they used to, and a
// user on Creator was told "Inactive" on one screen and "Active" on the other.
export const PLAN_STATUS_META: Record<
  string,
  { labelKey: string; color: "success" | "danger" | "warning" | "default" }
> = {
  active: { labelKey: "plan.statusActive", color: "success" },
  trialing: { labelKey: "plan.statusTrial", color: "success" },
  past_due: { labelKey: "plan.statusPastDue", color: "warning" },
  pending_cancel: { labelKey: "plan.statusCancelling", color: "warning" },
  paused: { labelKey: "plan.statusPaused", color: "default" },
  canceled: { labelKey: "plan.statusCancelled", color: "danger" },
  refunded: { labelKey: "plan.statusRefunded", color: "danger" },
  chargeback: { labelKey: "plan.statusChargeback", color: "danger" },
};

// Plan card copy per tier, per language — word for word what the homepage's
// pricing cards say (laskerstudio.com apps/site/content/landing/{ko,en}.ts),
// so the two never describe a plan differently. The backend owns prices and
// quotas; change both places together.
export type PlanCopy = {
  desc: string;
  quota: { amount: string; per?: string; note: string };
  includes: string;
  features: string[];
};

export const PLAN_COPY: Record<Lang, Record<string, PlanCopy>> = {
  en: {
    free: {
      desc: "14 days free from sign-up",
      quota: { amount: "60 min", note: "Footage read during the trial, measured on the uploaded original" },
      includes: "Core features",
      features: ["2 plan & rough-cut generations", "10 Agent chat edits", "Multicam support"],
    },
    light: {
      desc: "For a creator just getting started",
      quota: { amount: "180 min", per: "/ mo", note: "Footage read per month, measured on the uploaded original" },
      includes: "Everything in Free",
      features: ["Unlimited plans & rough cuts", "Unlimited Agent chat edits", "5 projects a month", "No watermark"],
    },
    creator: {
      desc: "For the full-time solo creator shipping one or two a week",
      quota: { amount: "300 min", per: "/ mo", note: "Footage read per month, measured on the uploaded original" },
      includes: "Everything in Light",
      features: ["Unlimited projects"],
    },
    business: {
      desc: "For in-house content teams and agencies making more video, faster",
      quota: { amount: "600 min", per: "/ mo", note: "Footage read per month, measured on the uploaded original" },
      includes: "Everything in Creator",
      features: [
        "3TB cloud storage",
        "Team workspace and member management",
        "Usage shared across the team",
        "Co-editing and comments",
        "Buy more cloud storage",
      ],
    },
  },
  ko: {
    free: {
      desc: "가입 후 14일 동안 무료 체험",
      quota: { amount: "60분", note: "체험 원본 처리량 (분석 요청한 원본 길이 기준)" },
      includes: "핵심 기능",
      features: ["기획안 및 러프컷 생성 2회", "Agent 채팅 편집 10회", "멀티앵글 지원"],
    },
    light: {
      desc: "가볍게 시작하는 크리에이터",
      quota: { amount: "180분", per: "/ 월", note: "월 원본 처리량 (분석 요청한 원본 길이 기준)" },
      includes: "Free의 모든 기능 포함",
      features: ["원본마다 분석·기획안 1회 포함", "Agent 채팅 편집 무제한", "프로젝트 월 5개", "워터마크 삭제"],
    },
    creator: {
      desc: "조연출 없이 주 1–2편을 만드는 1인 풀타임 크리에이터",
      quota: { amount: "300분", per: "/ 월", note: "월 원본 처리량 (분석 요청한 원본 길이 기준)" },
      includes: "Light의 모든 기능 포함",
      features: ["프로젝트 개수 무제한"],
    },
    business: {
      desc: "더 많은 영상을 효율적으로 제작하고 싶은 사내 콘텐츠 제작팀과 에이전시",
      quota: { amount: "600분", per: "/ 편집자·월", note: "좌석 수만큼 합산해 팀이 함께 사용" },
      includes: "Creator의 모든 기능 포함",
      features: [
        "3TB 클라우드 저장",
        "팀 워크스페이스와 멤버 관리",
        "팀원 간 사용량 공유",
        "공동 편집 및 코멘트 기능",
        "클라우드 추가 100GB당 월 5,800원",
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
