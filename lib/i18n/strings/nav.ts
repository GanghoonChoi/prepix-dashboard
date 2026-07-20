// Sidebar / header navigation. Namespace: nav.*
import type { Lang } from "../config";

export const nav: Record<Lang, Record<string, string>> = {
  en: {
    "nav.overview": "Overview",
    "nav.usage": "Usage",
    "nav.plan": "Plan",
    "nav.settings": "Settings",
    "nav.logout": "Log out",
    "nav.terms": "Terms",
    "nav.privacy": "Privacy",
    "nav.refund": "Refund",
    "nav.toggleMenu": "Toggle menu",
    "nav.language": "Language",
  },
  ko: {
    "nav.overview": "개요",
    "nav.usage": "사용량",
    "nav.plan": "플랜",
    "nav.settings": "설정",
    "nav.logout": "로그아웃",
    "nav.terms": "이용약관",
    "nav.privacy": "개인정보",
    "nav.refund": "환불",
    "nav.toggleMenu": "메뉴 열기",
    "nav.language": "언어",
  },
};
