"use client";
import { useEffect, useRef, useState } from "react";
import {
  b2bService,
  type TeamPerson,
  type OwnershipCredential,
} from "@/lib/api/services/b2b.service";
import { useWorkspace } from "@/components/workspaces/workspace-context";
import {
  Block,
  Details,
  inputClass,
  primaryClass,
  secondaryClass,
} from "@/components/workspaces/shared";
import { ReauthForm } from "@/components/workspaces/reauth-form";
import { B2bError, freeIntent, errorCode, useCopy } from "./shared";
type Action = "request" | "accept" | "cancel" | "decline";
type Intent = {
  action: Action;
  requestKey: string;
  revision: number;
  reason: string;
  targetId: string;
  transferId?: string;
};
/**
 * An ownership offer addressed to me, on the team home: settings is for
 * owners and admins, so everyone else answers it there (a viewer too, who is
 * otherwise sent to the project list). Once shown it stays: accepting removes
 * the offer, and unmounting then would drop a lost response's retry mid-flight.
 */
export function OwnershipOffer() {
  const me = useWorkspace()?.data;
  const offered = !!me?.pendingTransfer && me.pendingTransfer.toUserId === me.currentUserId;
  const [shown, setShown] = useState(offered);
  if (offered && !shown) setShown(true);
  return shown ? <OwnershipControls /> : null;
}
export function OwnershipControls() {
  const { data, b2b, reload } = useWorkspace()!;
  const c = useCopy();
  const [people, setPeople] = useState<TeamPerson[]>([]);
  const [target, setTarget] = useState("");
  const [reason, setReason] = useState("");
  const [confirm, setConfirm] = useState<"request" | "accept" | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState(false);
  const [busy, setBusy] = useState(false);
  const pending = useRef<Intent | null>(null);
  useEffect(() => {
    if (data.role !== "owner") return;
    let active = true;
    b2bService
      .members(data.workspace.id)
      .then((result) => {
        if (active) setPeople(result.people);
      })
      .catch((e) => {
        if (active) {
          setPeople([]);
          setError(errorCode(e));
        }
      });
    return () => {
      active = false;
    };
  }, [data.workspace.id, data.role]);
  if (!b2b?.enrolled) return null;
  const offer = data.pendingTransfer;
  const canAccept =
    offer?.toUserId === data.currentUserId && b2b.member.kind === "internal";
  async function execute(action: Action, credential?: OwnershipCredential) {
    if (busy || !b2b?.enrolled) return;
    if (pending.current && pending.current.action !== action) return;
    pending.current ??= {
      action,
      requestKey: crypto.randomUUID(),
      revision: b2b.team.revision,
      reason: reason.trim(),
      targetId: target,
      transferId: offer?.id,
    };
    const intent = pending.current;
    setBusy(true);
    setError("");
    setNotice(false);
    try {
      if (action === "request") {
        if (!credential) return;
        await b2bService.requestOwnership(data.workspace.id, {
          requestKey: intent.requestKey,
          revision: intent.revision,
          reason: intent.reason,
          targetId: intent.targetId,
          credential,
        });
      } else {
        if (!intent.transferId) return;
        await b2bService.resolveOwnership(
          data.workspace.id,
          intent.transferId,
          action,
          {
            requestKey: intent.requestKey,
            revision: intent.revision,
            reason: intent.reason,
            credential,
          },
        );
      }
      pending.current = null;
      setConfirm(null);
      setReason("");
      setNotice(true);
      await reload();
    } catch (e) {
      setError(errorCode(e));
      if (freeIntent(pending.current, e)) {
        pending.current = null;
        await reload();
      }
      throw e;
    } finally {
      setBusy(false);
    }
  }
  const frozen = busy || !!confirm || !!pending.current;
  return (
    <Block
      title={c("소유권", "Ownership")}
      description={c(
        "내부 후임이 본인 확인 후 수락하면 이전됩니다.",
        "Completes when an internal successor verifies and accepts.",
      )}
    >
      <div className="max-w-xl space-y-4">
        {offer && (
          <p className="text-[13px]">
            {canAccept
              ? c(
                  "이 팀의 소유권 이전 요청이 도착했습니다.",
                  "An ownership transfer request has arrived for this team.",
                )
              : c(
                  "소유권 이전 요청의 수락을 기다리고 있습니다.",
                  "An ownership request is awaiting acceptance.",
                )}
          </p>
        )}
        {!offer && data.role === "owner" && (
          <label className="block space-y-1.5 text-[13px]">
            <span>{c("내부 소유권 후임", "Internal ownership successor")}</span>
            <select
              aria-label={c("내부 소유권 후임", "Internal ownership successor")}
              className={inputClass}
              value={target}
              disabled={frozen}
              onChange={(e) => setTarget(e.target.value)}
            >
              <option value="">
                {c("내부 참여자 선택", "Choose internal participant")}
              </option>
              {people
                .filter(
                  (p) =>
                    p.kind === "internal" &&
                    !p.suspendedAt &&
                    p.userId !== data.currentUserId,
                )
                .map((p) => (
                  <option key={p.userId} value={p.userId}>
                    {p.name || p.email}
                  </option>
                ))}
            </select>
          </label>
        )}
        {(data.role === "owner" || offer?.toUserId === data.currentUserId) && (
          <label className="block space-y-1.5 text-[13px]">
            <span>{c("소유권 변경 사유", "Reason for ownership action")}</span>
            <textarea
              aria-label={c("소유권 변경 사유", "Reason for ownership action")}
              className={inputClass}
              required
              maxLength={1000}
              value={reason}
              disabled={frozen}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
        )}
        {!confirm && (
          <div className="flex flex-wrap gap-3">
            {!offer && data.role === "owner" && (
              <button
                className={primaryClass}
                disabled={
                  busy ||
                  !target ||
                  !reason.trim() ||
                  (!!pending.current && pending.current.action !== "request")
                }
                onClick={() => setConfirm("request")}
              >
                {c("소유권 이전 본인 확인", "Verify for ownership transfer")}
              </button>
            )}
            {canAccept && (
              <button
                className={primaryClass}
                disabled={busy || !reason.trim()}
                onClick={() => setConfirm("accept")}
              >
                {c("소유권 수락 본인 확인", "Verify to accept ownership")}
              </button>
            )}
            {offer?.toUserId === data.currentUserId && (
              <button
                className={secondaryClass}
                disabled={
                  busy ||
                  !reason.trim() ||
                  (!!pending.current && pending.current.action !== "decline")
                }
                onClick={() => void execute("decline").catch(() => {})}
              >
                {c("이전 요청 거절", "Decline request")}
              </button>
            )}
            {offer && data.role === "owner" && (
              <button
                className={secondaryClass}
                disabled={
                  busy ||
                  !reason.trim() ||
                  (!!pending.current && pending.current.action !== "cancel")
                }
                onClick={() => void execute("cancel").catch(() => {})}
              >
                {c("이전 요청 취소", "Cancel request")}
              </button>
            )}
          </div>
        )}
        {confirm && (
          <ReauthForm
            workspaceId={data.workspace.id}
            purpose={
              confirm === "request"
                ? `transfer:${pending.current?.targetId ?? target}`
                : `accept:${pending.current?.transferId ?? offer?.id}`
            }
            label={
              confirm === "request"
                ? c("본인 확인 후 이전 요청", "Verify and request transfer")
                : c("본인 확인 후 소유권 수락", "Verify and accept ownership")
            }
            onConfirm={(credential) => execute(confirm, credential)}
            cancelDisabled={!!pending.current}
            onCancel={() => {
              if (!pending.current) setConfirm(null);
            }}
          />
        )}
        {!!pending.current && (
          <p className="text-xs leading-5 text-muted">
            {c(
              "처리 결과를 확인할 때까지 같은 내용으로 다시 확인해 주세요.",
              "Retry with the same details until the result is confirmed.",
            )}
          </p>
        )}
        {error && <B2bError code={error} />}
        {notice && (
          <p role="status" className="text-[13px]">
            {c(
              "소유권 이전 상태를 업데이트했습니다.",
              "Ownership transfer status updated.",
            )}
          </p>
        )}
        <Details>
          <p>
            {c(
              "이전 소유자는 관리자로 남고 결제 위임은 회수됩니다. 편집 이용권과 AI, 이용기간은 바뀌지 않습니다.",
              "The previous owner stays an administrator and loses billing delegation. Editing licences, AI and the team period do not change.",
            )}
          </p>
        </Details>
      </div>
    </Block>
  );
}
