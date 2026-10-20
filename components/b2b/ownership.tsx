"use client";
import { useEffect, useRef, useState } from "react";
import {
  b2bService,
  type TeamPerson,
  type OwnershipCredential,
} from "@/lib/api/services/b2b.service";
import { useWorkspace } from "@/components/workspaces/workspace-context";
import { Button, Field, Select, SettingsSection, InfoTip } from "@/components/ui";
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
export function OwnershipControls({
  initialTarget = "",
  bare = false,
  onDone,
}: {
  /** The successor already chosen (from a row on 멤버). */
  initialTarget?: string;
  /** Without the section frame, inside a dialog that has its own title. */
  bare?: boolean;
  onDone?: () => void;
} = {}) {
  const { data, b2b, reload } = useWorkspace()!;
  const c = useCopy();
  const [people, setPeople] = useState<TeamPerson[]>([]);
  const [target, setTarget] = useState(initialTarget);
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
      reason: { request: "소유권 이전 요청", accept: "소유권 수락", cancel: "소유권 이전 취소", decline: "소유권 이전 거절" }[action],
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
      setNotice(true);
      await reload();
      onDone?.();
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
  const body = (
      <div className="space-y-4">
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
          <Field label={c("새 소유자", "New owner")} htmlFor="ownership-successor" className="max-w-sm">
            <Select
              id="ownership-successor"
              aria-label={c("새 소유자", "New owner")}
              value={target}
              disabled={frozen}
              onChange={(e) => setTarget(e.target.value)}
            >
              <option value="">
                {c("멤버 선택", "Choose a member")}
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
            </Select>
          </Field>
        )}
        {!confirm && (
          <div className="flex flex-wrap gap-2">
            {!offer && data.role === "owner" && (
              <Button
                disabled={
                  busy ||
                  !target ||
                  (!!pending.current && pending.current.action !== "request")
                }
                onClick={() => setConfirm("request")}
              >
                {c("소유권 이전하기", "Transfer ownership")}
              </Button>
            )}
            {canAccept && (
              <Button
                disabled={busy}
                onClick={() => setConfirm("accept")}
              >
                {c("소유자 수락하기", "Accept ownership")}
              </Button>
            )}
            {offer?.toUserId === data.currentUserId && (
              <Button
                variant="secondary"
                disabled={
                  busy ||
                  (!!pending.current && pending.current.action !== "decline")
                }
                onClick={() => void execute("decline").catch(() => {})}
              >
                {c("이전 요청 거절", "Decline request")}
              </Button>
            )}
            {offer && data.role === "owner" && (
              <Button
                variant="secondary"
                disabled={
                  busy ||
                  (!!pending.current && pending.current.action !== "cancel")
                }
                onClick={() => void execute("cancel").catch(() => {})}
              >
                {c("이전 요청 취소", "Cancel request")}
              </Button>
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
                ? c("본인 확인하고 이전하기", "Verify and transfer")
                : c("본인 확인하고 수락", "Verify and accept")
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
        <InfoTip label={c("이전하면 무엇이 바뀌나요?", "What changes after a transfer?")} text={c("이전하면 무엇이 바뀌나요?", "What changes after a transfer?")}>
          <p>
            {c(
              "이전 소유자는 관리자로 남고 결제 위임은 회수됩니다. 편집 이용권과 AI, 이용기간은 바뀌지 않습니다.",
              "The previous owner stays an administrator and loses billing delegation. Editing licences, AI and the team period do not change.",
            )}
          </p>
        </InfoTip>
      </div>
  );
  if (bare) return body;
  return (
    <SettingsSection
      title={c("소유권", "Ownership")}
      description={c(
        "소유권 이전은 같은 팀 내에서만 가능합니다.",
        "Ownership can only be transferred within the same team.",
      )}
    >
      {body}
    </SettingsSection>
  );
}
