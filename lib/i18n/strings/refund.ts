import type { Lang } from "../config";

/**
 * The refund request thread, as the customer sees it on the plan page.
 * Separate from `plan` because these strings belong to the request's own
 * lifecycle — filed, answered, closed — not to the plan surface.
 */
export const refund: Record<Lang, Record<string, string>> = {
  en: {
    "refund.cardTitle": "Your refund request",
    "refund.filedAt": "Submitted {date}",
    "refund.statusOpen": "Under review",
    "refund.statusAnswered": "We replied",
    "refund.statusClosed": "Closed",
    "refund.openHelp":
      "Our team checks your payment date and usage, then replies here — usually within 3 business days.",
    "refund.authorTeam": "PREPIX",
    "refund.authorYou": "You",
    "refund.replyPlaceholder": "Add anything else we should know",
    "refund.replySend": "Send",
    "refund.replySending": "Sending…",
    "refund.replyFailed": "Couldn't send that. Please try again.",
  },
  ko: {
    "refund.cardTitle": "환불 요청",
    "refund.filedAt": "{date} 접수",
    "refund.statusOpen": "검토 중",
    "refund.statusAnswered": "답변 완료",
    "refund.statusClosed": "처리 완료",
    "refund.openHelp":
      "고객지원팀이 결제일과 이용 내역을 확인한 뒤 여기에 답변드려요. 보통 3영업일 이내에 안내드립니다.",
    "refund.authorTeam": "PREPIX",
    "refund.authorYou": "나",
    "refund.replyPlaceholder": "추가로 전달할 내용이 있으면 적어주세요",
    "refund.replySend": "보내기",
    "refund.replySending": "보내는 중…",
    "refund.replyFailed": "전송하지 못했어요. 다시 시도해 주세요.",
  },
};
