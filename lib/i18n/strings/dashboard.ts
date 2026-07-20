// Overview / home page. Namespace: dashboard.*
import type { Lang } from "../config";

export const dashboard: Record<Lang, Record<string, string>> = {
  en: {
    "dashboard.title": "Overview",
    "dashboard.welcomeBack": "Welcome back, {name}",
    "dashboard.welcomeBackGeneric": "Welcome back",
    "dashboard.loadError": "Couldn't load your account data.",
    "dashboard.creditsRemaining": "Credits remaining",
    "dashboard.usage": "Usage",
    "dashboard.usedOfTotal": "{used} used of {total} this month",
    "dashboard.planLabel": "Plan",
    "dashboard.active": "Active",
    "dashboard.inactive": "Inactive",
    "dashboard.videosThisMonth": "Videos this month",
    "dashboard.completedCount": "{count} completed",
    "dashboard.upgradePlan": "Upgrade plan",
    "dashboard.settings": "Settings",
    "dashboard.downloadDesktopApp": "Download desktop app",
  },
  ko: {
    "dashboard.title": "개요",
    "dashboard.welcomeBack": "{name}님, 환영해요",
    "dashboard.welcomeBackGeneric": "환영해요",
    "dashboard.loadError": "계정 정보를 불러오지 못했어요.",
    "dashboard.creditsRemaining": "남은 크레딧",
    "dashboard.usage": "사용량",
    "dashboard.usedOfTotal": "이번 달 {total} 중 {used} 사용",
    "dashboard.planLabel": "플랜",
    "dashboard.active": "활성",
    "dashboard.inactive": "비활성",
    "dashboard.videosThisMonth": "이번 달 영상",
    "dashboard.completedCount": "{count}개 완료",
    "dashboard.upgradePlan": "플랜 업그레이드",
    "dashboard.settings": "설정",
    "dashboard.downloadDesktopApp": "데스크톱 앱 다운로드",
  },
};
