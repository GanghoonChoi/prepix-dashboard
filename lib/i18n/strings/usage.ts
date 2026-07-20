// Usage page. Namespace: usage.*
import type { Lang } from "../config";

export const usage: Record<Lang, Record<string, string>> = {
  en: {
    "usage.title": "Usage",
    "usage.loadError": "Couldn't load your usage data.",
    "usage.inferenceQuota": "Inference quota",
    "usage.remaining": "remaining",
    "usage.total": "Total",
    "usage.used": "Used",
    "usage.videos": "Videos",
    "usage.thisMonth": "This month",
    "usage.completed": "Completed",
    "usage.processing": "Processing",
  },
  ko: {
    "usage.title": "사용량",
    "usage.loadError": "사용량 데이터를 불러오지 못했어요.",
    "usage.inferenceQuota": "추론 크레딧",
    "usage.remaining": "남음",
    "usage.total": "전체",
    "usage.used": "사용",
    "usage.videos": "영상",
    "usage.thisMonth": "이번 달",
    "usage.completed": "완료",
    "usage.processing": "처리 중",
  },
};
