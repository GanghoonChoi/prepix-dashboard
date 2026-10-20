// The desktop handoff screen (/connect). Namespace: connect.*
import type { Lang } from "../config";

export const connect: Record<Lang, Record<string, string>> = {
  en: {
    "connect.accountChanged": "Your account changed. Check the email and confirm again.",
    "connect.switchAccount": "Use another account",
    "connect.retry": "Try again",
    "connect.title": "Sign in to the Prepix app",
    "connect.subtitle":
      "The app on this computer is asking to sign in as you. Nothing is shared until you continue.",
    "connect.accountLabel": "Signing in as",
    "connect.confirm": "Continue",
    "connect.connecting": "Signing in…",
    "connect.handingOver": "Return to the Prepix app",
    "connect.returnToApp": "If your browser asks to open Prepix, choose Open. You can close this tab afterwards.",
    "connect.openApp": "Open Prepix",
    "connect.note":
      "Only an app running on this computer can receive this. You can sign out from the app at any time.",
    "connect.failed": "Could not connect the app. Try again from the app.",
    "connect.invalidTitle": "This link cannot be used",
    "connect.invalidBody":
      "It did not come from the Prepix app on this computer, or it has been altered. Open the app and choose “Sign in with browser” again.",

    "session.title": "Signing you in",
    "session.failedTitle": "That sign-in link has expired",
    "session.failedBody":
      "It only works once, and only for a couple of minutes. Sign in again and you will come straight back.",
  },
  ko: {
    "connect.accountChanged": "계정이 변경되었습니다. 이메일을 확인하고 다시 연결해 주세요.",
    "connect.switchAccount": "다른 계정 사용",
    "connect.retry": "다시 시도",
    "connect.title": "Prepix 앱에 로그인",
    "connect.subtitle":
      "이 컴퓨터의 앱이 이 계정으로 로그인하려고 합니다. 계속을 누르기 전까지는 아무것도 전달되지 않습니다.",
    "connect.accountLabel": "로그인할 계정",
    "connect.confirm": "계속",
    "connect.connecting": "로그인하는 중…",
    "connect.handingOver": "Prepix 앱으로 돌아가세요",
    "connect.returnToApp": "브라우저가 Prepix를 열지 물으면 ‘열기’를 눌러주세요. 그다음 이 탭은 닫아도 됩니다.",
    "connect.openApp": "Prepix 열기",
    "connect.note":
      "이 컴퓨터에서 실행 중인 앱만 받을 수 있습니다. 앱에서 언제든 로그아웃할 수 있습니다.",
    "connect.failed": "앱을 연결하지 못했습니다. 앱에서 다시 시도해주세요.",
    "connect.invalidBody":
      "이 컴퓨터의 Prepix 앱에서 온 링크가 아니거나, 주소가 바뀌었습니다. 앱을 열고 ‘브라우저에서 로그인’을 다시 눌러주세요.",
    "connect.invalidTitle": "사용할 수 없는 링크입니다",

    "session.title": "로그인하는 중",
    "session.failedTitle": "로그인 링크가 만료됐습니다",
    "session.failedBody":
      "한 번만, 그리고 몇 분 동안만 쓸 수 있습니다. 다시 로그인하면 바로 여기로 돌아옵니다.",
  },
};
