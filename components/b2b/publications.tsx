"use client";
import { useCallback, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { PublicationList, TeamPublication } from "@/lib/api/generated/b2b";
import { publicationsService, publicationOrigin } from "@/lib/api/services/b2b-publications.service";
import type { PublicationOperation, PublicationScope } from "@/lib/b2b-publications/operations";
import { publicationScopeKey } from "@/lib/b2b-publications/operations";
import { useWorkspace } from "@/components/workspaces/workspace-context";
import { primaryClass, secondaryClass, TeamLoading, TeamShell } from "@/components/workspaces/shared";
import { B2bError, errorCode, useCopy } from "./shared";
import { kst, timecode, useLoader } from "./reviews";

const code = (e: unknown) => e instanceof Error && e.message.startsWith("B2B_") ? e.message : errorCode(e);
const errors: Record<string, [string, string]> = {
  B2B_PUBLICATION_OPERATION_PENDING: ["결과가 확인되지 않은 공개 요청이 있습니다. 원래 요청의 결과부터 확인해 주세요.", "An unresolved publication remains. Check the original request first."],
  B2B_PUBLICATION_STORAGE_UNAVAILABLE: ["이 브라우저에서 공개 요청을 보존할 수 없습니다. 브라우저 저장소를 확인해 주세요.", "This browser cannot retain the publication request. Check browser storage."],
  B2B_PUBLICATION_RECEIPT_INVALID: ["공개 결과가 원래 요청과 일치하지 않습니다. 원래 기록을 유지했습니다.", "The publication receipt does not match. The original record is retained."],
  B2B_PUBLICATION_OPERATION_INVALID: ["저장된 공개 요청을 확인할 수 없습니다. 원래 기록을 유지했습니다.", "The saved publication request cannot be verified. It is retained."],
  B2B_PUBLICATION_ALREADY_PUBLISHED: ["이미 검토에 공개된 결과입니다. 기존 검토를 확인해 주세요.", "This result is already published. Open the existing review."],
  B2B_PUBLICATION_NOT_FOUND: ["현재 계정에서 볼 수 있는 등록 결과가 아닙니다.", "This registered result is unavailable to the current account."],
  B2B_PUBLICATION_PLAYBACK_REQUIRED: ["현재 결과를 다시 재생하고 확인해 주세요. 프로젝트가 바뀌었거나 재생 주소가 만료되었습니다.", "Play and confirm this result again. The project changed or playback expired."],
};
function PublicationError({ error, retry }: { error: string; retry?: () => void }) {
  const c = useCopy(), message = errors[error];
  if (!message) return <B2bError code={error} retry={retry} />;
  return <div role="alert" className="rounded-lg border border-border p-4 text-sm"><p>{c(...message)}</p>{retry && <button type="button" className={`${secondaryClass} mt-3`} onClick={retry}>{c("다시 확인", "Check again")}</button>}</div>;
}
type PageData = PublicationList & { pending: PublicationOperation[]; recoveryError: string };
export function ProjectPublications({ projectId, publicationId }: { projectId: string; publicationId?: string }) {
  const context = useWorkspace()!, c = useCopy();
  const scope = { origin: publicationOrigin(), userId: context.data.currentUserId ?? "", workspaceId: context.data.workspace.id, projectId };
  if (!context.b2b?.enrolled || !context.b2b.allowedActions.projects) return <TeamShell title={c("등록된 결과", "Registered results")}><B2bError code="B2B_PROJECT_NOT_FOUND" /></TeamShell>;
  const requestedId = publicationId && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(publicationId) ? publicationId : "";
  return <ScopedPublications key={`${publicationScopeKey(scope)}:${requestedId}`} scope={scope} requestedId={requestedId} />;
}
function ScopedPublications({ scope: initial, requestedId }: { scope: PublicationScope; requestedId: string }) {
  const c = useCopy(), scope = useMemo(() => initial, [initial]);
  const [cursor, setCursor] = useState<string | undefined>(), [busy, setBusy] = useState(false), [actionError, setActionError] = useState("");
  const applying = useRef(false);
  const read = useCallback(async (): Promise<PageData> => {
    let recoveryError = "";
    for (const r of await publicationsService.pending(scope)) {
      try { await publicationsService.check(r); } catch (e) { recoveryError = code(e); }
    }
    const data = await publicationsService.list(scope, cursor);
    if (requestedId && !data.publications.some((p) => p.id === requestedId)) {
      try { data.publications.unshift((await publicationsService.detail(scope, requestedId)).publication); }
      catch (e) { recoveryError = code(e); }
    }
    return { ...data, pending: await publicationsService.pending(scope), recoveryError };
  }, [scope, cursor, requestedId]);
  const { data, error, stale, load } = useLoader(read, 15000);
  const base = `/dashboard/workspaces/${scope.workspaceId}/projects/${scope.projectId}`;
  const retry = async (r: PublicationOperation) => {
    if (applying.current) return;
    applying.current = true; setBusy(true); setActionError("");
    try { await publicationsService.retry(r); } catch (e) { setActionError(code(e)); }
    finally { applying.current = false; setBusy(false); await load(); }
  };
  // Fallback only: no list = every internal member who can see the project, no approver.
  const publishNow = async (p: TeamPublication) => {
    if (applying.current || !data) return;
    applying.current = true; setBusy(true); setActionError("");
    try { await publicationsService.publish(scope, p, { requestKey: crypto.randomUUID(), revision: data.projectRevision }); }
    catch (e) { setActionError(code(e)); }
    finally { applying.current = false; setBusy(false); await load(); }
  };
  if (!data && !error) return <TeamLoading />;
  return <TeamShell title={c("등록된 결과", "Registered results")} description={c("앱에서 발행한 결과입니다. 검토본이 준비되면 이 프로젝트를 볼 수 있는 내부 구성원에게 검토로 자동 공개됩니다. 외부 참여자는 담당자가 회차에 추가하거나 공유 링크를 보낼 때만 봅니다.", "Results published from the app. Each opens for review to the internal members who can see this project once its review copy is ready. External participants see it only when the lead adds them to the round or sends a share link.")}>
    <Link href={base} className={secondaryClass}>{c("프로젝트로", "Project")}</Link>
    {error && <PublicationError error={error} retry={() => void load()} />}
    {stale && <p role="status" className="text-sm text-muted">{c("마지막으로 확인한 기록입니다. 최신 상태를 확인하기 전에는 공개할 수 없습니다.", "Showing the last confirmed records. Refresh before publishing.")}</p>}
    {actionError && <PublicationError error={actionError} />}
    {data?.recoveryError && !data.pending.length && <PublicationError error={data.recoveryError} />}
    {data && <>
      <dl className="grid gap-5 border-b border-border pb-6 sm:grid-cols-3">
        {([[c("최신 등록 버전", "Latest registered version"), data.latestRegisteredVersionId], [c("현재 검토 버전", "Current review version"), data.currentReviewVersionId], [c("최종 승인 버전", "Final approved version"), data.finalApprovedVersionId]] as const).map(([label, id]) => <div key={label}><dt className="text-sm text-muted">{label}</dt><dd data-testid={label === c("최신 등록 버전", "Latest registered version") ? "latest-result" : label === c("현재 검토 버전", "Current review version") ? "current-review" : "final-approved"} className="mt-2 break-all font-mono text-[11px]">{id ?? c("없음", "None")}</dd></div>)}
      </dl>
      {!!data.pending.length && <section aria-label={c("공개 결과 복구", "Recover publication")} className="space-y-3 rounded-lg border border-border p-4">
        <h2 className="font-medium">{c("결과 확인이 필요한 공개 요청", "Publication requests awaiting confirmation")}</h2>
        <p className="text-sm text-muted">{c("원래 계정·프로젝트·요청 키로 결과를 조회합니다. 미처리로 확인된 경우 같은 요청만 다시 보냅니다.", "The original account, project and key are checked. Only that same request is resent if proven not received.")}</p>
        {data.recoveryError && <PublicationError error={data.recoveryError} />}
        {data.pending.map((r) => <div key={r.input.requestKey} className="flex flex-wrap items-center gap-3"><span className="break-all font-mono text-xs">{r.input.requestKey}</span><button type="button" className={secondaryClass} disabled={busy} onClick={() => void retry(r)}>{c("원래 공개 요청 다시 확인", "Check original publication")}</button></div>)}
      </section>}
      <section className="space-y-3" aria-label={c("결과 목록", "Result list")}>
        {!data.publications.length && <p className="text-sm text-muted">{c("현재 볼 수 있는 등록 결과가 없습니다. 앱에서 프로젝트 결과를 등록해 주세요.", "No accessible results have been registered. Register a project result from the app.")}</p>}
        {data.publications.map((p) => <article key={p.id} data-testid={`publication-${p.id}`} className="space-y-3 border-b border-border py-5">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-medium">{p.title}</h2><p className="mt-1 text-sm text-muted">{c("생성", "Generated")} {kst(p.generatedAt)} · {p.metadata.durationMs === null ? c("길이 정보 없음", "Duration unavailable") : timecode(p.metadata.durationMs)} · {p.size.toLocaleString()} B</p></div><span className="text-sm">{p.state === "published" ? c("검토 공개됨", "Published to review") : c("자료 등록됨", "Result registered")} · {p.previewState === "ready" ? c("재생 준비됨", "Playback ready") : p.previewState === "failed" ? c("재생 준비 실패", "Playback preparation failed") : p.previewState === "not_requested" ? c("재생 준비 전", "Playback not requested") : c("재생 준비 중", "Preparing playback")}</span></div>
          <dl className="grid gap-2 text-xs sm:grid-cols-2"><div><dt className="text-muted">{c("결과 버전", "Result version")}</dt><dd className="break-all font-mono">{p.versionId}</dd></div><div><dt className="text-muted">{c("원본 작업 / 결과", "Original work / result")}</dt><dd className="break-all font-mono">{p.originWorkId} / {p.originResultId}</dd></div></dl>
          {p.reviewId ? <Link className={secondaryClass} href={`${base}/reviews/${p.reviewId}`}>{c("공개한 검토 보기", "Open published review")}</Link>
            : p.previewState === "failed" ? <p role="status" className="text-sm text-muted">{c("검토본을 만들지 못해 공개되지 않았습니다. 앱에서 결과를 다시 발행해 주세요.", "The review copy could not be made, so this result is not published. Publish it again from the app.")}</p>
            : <div className="flex flex-wrap items-center gap-3"><p role="status" className="text-sm text-muted">{p.automaticSkip === "superseded" ? c("더 새 버전이 이미 검토 중이라 자동으로 공개하지 않았습니다", "A newer version is already under review, so this was not opened automatically")
              : p.automaticSkip === "legacy" ? c("자동 공개 이전에 등록된 결과라 자동으로 공개하지 않습니다", "Registered before automatic publication, so it is not opened automatically")
              : c("검토본 준비 중 — 준비되면 팀 내부에 자동으로 공개됩니다", "Preparing the review copy — it opens to the team's internal members automatically when ready")}</p>
              {p.allowedActions.publish && <button type="button" className={primaryClass} disabled={stale || !!error || busy || data.pending.some((r) => r.target === p.id)} onClick={() => void publishNow(p)}>{c("지금 공개", "Publish now")}</button>}</div>}
        </article>)}
        <div className="flex gap-3">{cursor && <button type="button" className={secondaryClass} onClick={() => setCursor(undefined)}>{c("최신 결과", "Latest results")}</button>}{data.nextCursor && <button type="button" className={secondaryClass} onClick={() => setCursor(data.nextCursor!)}>{c("이전 결과", "Older results")}</button>}</div>
      </section>
    </>}
  </TeamShell>;
}
