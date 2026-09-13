"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Script from "next/script";
import { useI18n } from "@/lib/i18n/context";
import {
  workspaceService,
  type Challenge,
  type Credential,
} from "@/lib/api/services/workspace.service";
import { inputClass, primaryClass, secondaryClass } from "./shared";
import { CloudError, cloudErrorCode } from "./cloud-shared";
export function ReauthForm({
  workspaceId,
  purpose,
  label,
  onConfirm,
  onCancel,
}: {
  workspaceId: string;
  purpose: string;
  label: string;
  onConfirm: (credential: Credential) => Promise<void>;
  onCancel: () => void;
}) {
  const { lang } = useI18n();
  const c = (ko: string, en: string) => (lang === "ko" ? ko : en);
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [googleReady, setGoogleReady] = useState(false);
  const googleRef = useRef<HTMLDivElement>(null);
  const submitting = useRef(false);
  const confirmRef = useRef(onConfirm);
  useEffect(() => {
    confirmRef.current = onConfirm;
  });
  const prepare = useCallback(async () => {
    setChallenge(null);
    setError("");
    try {
      setChallenge(await workspaceService.challenge(workspaceId, purpose));
    } catch (e) {
      setError(cloudErrorCode(e));
    }
  }, [workspaceId, purpose]);
  useEffect(() => {
    void prepare();
  }, [prepare]);
  const submit = useCallback(async (credential: Credential) => {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      await confirmRef.current(credential);
    } catch (e) {
      setError(cloudErrorCode(e));
      setChallenge(null);
    } finally {
      setPassword("");
      setBusy(false);
      submitting.current = false;
    }
  }, []);
  useEffect(() => {
    const gsi = window.google?.accounts.id;
    if (
      !gsi ||
      !challenge?.googleAvailable ||
      !googleRef.current ||
      !process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID
    )
      return;
    let active = true;
    gsi.initialize({
      client_id: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
      nonce: challenge.nonce,
      auto_select: false,
      callback: (response: { credential?: string }) => {
        if (active && response.credential)
          void submit({
            challengeId: challenge.id,
            idToken: response.credential,
          });
      },
    });
    googleRef.current.replaceChildren();
    gsi.renderButton(googleRef.current, {
      type: "standard",
      theme: "filled_black",
      size: "large",
      text: "continue_with",
      width: 240,
      locale: lang,
    });
    return () => {
      active = false;
    };
  }, [challenge, googleReady, lang, submit]);
  return (
    <div className="space-y-4 rounded-lg border border-border bg-surface p-5">
      <p className="text-sm font-medium">
        {c(
          "소유권 변경을 위한 본인 확인",
          "Verify your identity to change ownership",
        )}
      </p>
      <p className="text-sm leading-6 text-muted">
        {c(
          "현재 로그인한 계정으로 확인하세요. 확인은 이 요청에만 적용되며 5분 동안 유효합니다.",
          "Verify with your current account. This verification applies only to this request and expires in 5 minutes.",
        )}
      </p>
      {error && <CloudError code={error} />}
      {!challenge && (
        <button className={secondaryClass} disabled={busy} onClick={prepare}>
          {c("본인 확인 다시 시작", "Restart verification")}
        </button>
      )}
      {challenge?.passwordAvailable && (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void submit({ challengeId: challenge.id, password });
          }}
        >
          <label className="block space-y-2 text-sm">
            <span>{c("현재 비밀번호", "Current password")}</span>
            <input
              className={inputClass}
              type="password"
              autoComplete="current-password"
              maxLength={256}
              required
              value={password}
              disabled={busy}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <button className={primaryClass} disabled={busy || !password}>
            {busy ? c("확인 중…", "Verifying…") : label}
          </button>
        </form>
      )}
      {challenge?.googleAvailable &&
        process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID && (
          <>
            <Script
              src="https://accounts.google.com/gsi/client"
              onReady={() => setGoogleReady(true)}
              onError={() => setError("WORKSPACE_REAUTH_FAILED")}
            />
            <p className="text-xs leading-5 text-muted">
              {c(
                `연결된 Google 계정으로 확인하면 ‘${label}’ 작업을 실행합니다.`,
                `Verifying with your linked Google account will ${label.toLowerCase()}.`,
              )}
            </p>
            <div
              className={busy ? "pointer-events-none opacity-50" : ""}
              ref={googleRef}
            />
          </>
        )}
      {challenge &&
        !challenge.passwordAvailable &&
        !(
          challenge.googleAvailable && process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID
        ) && (
          <p role="alert" className="text-sm">
            {c(
              "현재 환경에서 연결된 계정의 본인 확인을 사용할 수 없습니다.",
              "Verification for your linked account is unavailable in this environment.",
            )}
          </p>
        )}
      <button className={secondaryClass} disabled={busy} onClick={onCancel}>
        {c("취소", "Cancel")}
      </button>
    </div>
  );
}
