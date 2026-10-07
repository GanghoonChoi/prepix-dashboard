// Usage page. Namespace: usage.*
import type { Lang } from "../config";

export const usage: Record<Lang, Record<string, string>> = {
  en: {
    "usage.title": "Usage",
    "usage.loadError": "Couldn't load your usage data.",
    "usage.timeLeft": "AI time left",
    "usage.ofTotal": "of {total}",
    "usage.usedAmount": "{amount} used",
    "usage.unlimited": "Unlimited",
    "usage.videosThisMonth": "Videos this month",
    "usage.completedCount": "{count} completed",
    "usage.processingCount": "{count} processing",
  },
  ko: {
    "usage.title": "사용량",
    "usage.loadError": "사용량 데이터를 불러오지 못했어요.",
    "usage.timeLeft": "남은 AI 처리 시간",
    "usage.ofTotal": "/ {total}",
    "usage.usedAmount": "{amount} 사용",
    "usage.unlimited": "무제한",
    "usage.videosThisMonth": "이번 달 영상",
    "usage.completedCount": "{count}개 완료",
    "usage.processingCount": "처리 중 {count}개",
  },
};
