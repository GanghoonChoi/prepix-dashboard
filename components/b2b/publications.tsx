"use client";
import { useCallback, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { PublicationList, ReviewAudienceCandidates, TeamPublication } from "@/lib/api/generated/b2b";
import { publicationsService, publicationOrigin } from "@/lib/api/services/b2b-publications.service";
import { reviewsService, NO_REVIEW } from "@/lib/api/services/b2b-reviews.service";
import type { PublicationOperation, PublicationScope } from "@/lib/b2b-publications/operations";
import { publicationScopeKey } from "@/lib/b2b-publications/operations";
import { useWorkspace } from "@/components/workspaces/workspace-context";
import { inputClass, primaryClass, secondaryClass, TeamLoading, TeamShell } from "@/components/workspaces/shared";
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
type PageData = PublicationList & { candidates: ReviewAudienceCandidates | null; pending: PublicationOperation[]; recoveryError: string };
export function ProjectPublications({ projectId, publicationId }: { projectId: string; publicationId?: string }) {
  const context = useWorkspace()!, c = useCopy();
  const scope = { origin: publicationOrigin(), userId: context.data.currentUserId ?? "", workspaceId: context.data.workspace.id, projectId };
  if (!context.b2b?.enrolled || !context.b2b.allowedActions.projects) return <TeamShell title={c("등록된 결과", "Registered results")}><B2bError code="B2B_PROJECT_NOT_FOUND" /></TeamShell>;
  const requestedId = publicationId && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(publicationId) ? publicationId : "";
  return <ScopedPublications key={`${publicationScopeKey(scope)}:${requestedId}`} scope={scope} requestedId={requestedId} />;
}
function ScopedPublications({ scope: initial, requestedId }: { scope: PublicationScope; requestedId: string }) {
  const c = useCopy(), scope = useMemo(() => initial, [initial]);
  const reviewScope = useMemo(() => ({ ...scope, kind: "project" as const, reviewId: NO_REVIEW }), [scope]);
  const [cursor, setCursor] = useState<string | undefined>(), [selectedId, setSelectedId] = useState(requestedId), [busy, setBusy] = useState(false), [actionError, setActionError] = useState("");
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
    const candidates = data.publications.some((p) => p.allowedActions.publish) ? await reviewsService.audienceCandidates(reviewScope) : null;
    return { ...data, candidates, pending: await publicationsService.pending(scope), recoveryError };
  }, [scope, cursor, reviewScope, requestedId]);
  const { data, error, stale, load } = useLoader(read, 15000);
  const selected = data?.publications.find((p) => p.id === selectedId);
  const base = `/dashboard/workspaces/${scope.workspaceId}/projects/${scope.projectId}`;
  const retry = async (r: PublicationOperation) => {
    if (applying.current) return;
    applying.current = true; setBusy(true); setActionError("");
    try { await publicationsService.retry(r); } catch (e) { setActionError(code(e)); }
    finally { applying.current = false; setBusy(false); await load(); }
  };
  if (!data && !error) return <TeamLoading />;
  return <TeamShell title={c("등록된 결과", "Registered results")} description={c("앱에서 등록한 결과를 확인하고, 재생 확인 후 담당자가 검토에 공개합니다.", "Review results registered from the app. The lead publishes them after checking playback.")}>
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
          {p.reviewId ? <Link className={secondaryClass} href={`${base}/reviews/${p.reviewId}`}>{c("공개한 검토 보기", "Open published review")}</Link> : <button type="button" className={secondaryClass} disabled={!p.allowedActions.publish || stale || !!error || busy || data.pending.some((r) => r.target === p.id)} onClick={() => setSelectedId(p.id)}>{c("이 결과 공개 준비", "Prepare this result for publication")}</button>}
        </article>)}
        <div className="flex gap-3">{cursor && <button type="button" className={secondaryClass} onClick={() => { setCursor(undefined); setSelectedId(""); }}>{c("최신 결과", "Latest results")}</button>}{data.nextCursor && <button type="button" className={secondaryClass} onClick={() => { setCursor(data.nextCursor!); setSelectedId(""); }}>{c("이전 결과", "Older results")}</button>}</div>
      </section>
      {selected?.allowedActions.publish && <PublishPanel key={`${selected.id}:${selected.versionId}`} scope={scope} publication={selected} revision={data.projectRevision} candidates={data.candidates?.candidates ?? []} disabled={busy || stale || !!error || data.pending.some((r) => r.target === selected.id)} refresh={load} />}
    </>}
  </TeamShell>;
}
function PublishPanel({ scope, publication: p, revision, candidates, disabled, refresh }: { scope: PublicationScope; publication: TeamPublication; revision: number; candidates: ReviewAudienceCandidates["candidates"]; disabled: boolean; refresh: () => Promise<void> }) {
  const c = useCopy(), [audience, setAudience] = useState<string[]>([]), [approver, setApprover] = useState(""), [source, setSource] = useState<{ url: string; expiresAt: string; revision: number } | null>(null), [played, setPlayed] = useState(false), [confirmed, setConfirmed] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const applying = useRef(false);
  const reviewScope = { ...scope, kind: "project" as const, reviewId: NO_REVIEW };
  const canPublish = !disabled && !busy && p.previewState === "ready" && played && confirmed && source?.revision === revision && audience.length > 0 && audience.every((id) => candidates.some((u) => u.userId === id)) && audience.includes(approver);
  const play = async () => {
    setBusy(true); setError(""); setPlayed(false); setConfirmed(false); setSource(null);
    try { const next = await reviewsService.previewPlayback(reviewScope, p.versionId); setSource({ ...next, revision }); }
    catch (e) { setError(code(e)); } finally { setBusy(false); }
  };
  const publish = async () => {
    if (!canPublish || applying.current) return;
    if (!source || new Date(source.expiresAt).getTime() <= Date.now()) { setPlayed(false); setConfirmed(false); setError("B2B_PUBLICATION_PLAYBACK_REQUIRED"); return; }
    applying.current = true; setBusy(true); setError("");
    try { await publicationsService.publish(scope, p, { requestKey: crypto.randomUUID(), revision, audienceUserIds: audience, approverUserId: approver }); }
    catch (e) { setError(code(e)); }
    finally { applying.current = false; setBusy(false); await refresh(); }
  };
  const roles = { lead: c("담당자", "Lead"), producer: c("제작자", "Producer"), reviewer: c("검토자", "Reviewer") };
  return <section aria-label={c("검토 공개 준비", "Prepare review publication")} className="space-y-5 rounded-lg border border-border p-5">
    <h2 className="font-medium">{c("검토 공개 준비", "Prepare review publication")}: {p.title}</h2>
    <p className="text-sm text-muted">{c("등록만으로 검토에 공개되지 않습니다. 이 결과를 재생한 뒤 검토 대상과 승인자 한 명을 선택해 주세요.", "Registration does not publish a review. Play this result, then select its audience and one approver.")}</p>
    {error && <PublicationError error={error} />}
    <button type="button" className={secondaryClass} disabled={disabled || busy} onClick={() => void play()}>{c("공개 전 재생", "Play before publication")}</button>
    {source && <video key={source.url} src={source.url} controls preload="metadata" className="w-full rounded-md bg-background" onPlaying={() => setPlayed(true)} onError={() => { setPlayed(false); setConfirmed(false); setError("B2B_PREVIEW_NOT_READY"); }} />}
    <label className="flex items-center gap-3 text-sm"><input type="checkbox" checked={confirmed} disabled={disabled || busy || !played || source?.revision !== revision} onChange={(e) => setConfirmed(e.target.checked)} />{c("이 결과의 재생을 확인했습니다", "I checked playback of this result")}</label>
    {source && source.revision !== revision && <p role="status" className="text-sm text-muted">{c("프로젝트가 변경되었습니다. 다시 재생한 뒤 공개해 주세요.", "The project changed. Play again before publishing.")}</p>}
    <fieldset disabled={disabled || busy} className="space-y-3"><legend className="mb-3 text-sm font-medium">{c("검토 대상 선택", "Select review audience")}</legend>{candidates.map((person) => <label key={person.userId} className="flex items-center gap-3 text-sm"><input type="checkbox" checked={audience.includes(person.userId)} onChange={(e) => { setAudience((prior) => e.target.checked ? [...prior, person.userId] : prior.filter((id) => id !== person.userId)); if (!e.target.checked && approver === person.userId) setApprover(""); }} />{person.label} · {roles[person.role]}</label>)}</fieldset>
    <label className="block space-y-2 text-sm"><span>{c("승인자 선택", "Select approver")}</span><select aria-label={c("승인자 선택", "Select approver")} className={inputClass} value={approver} disabled={disabled || busy} onChange={(e) => setApprover(e.target.value)}><option value="">{c("한 명 선택", "Select one person")}</option>{candidates.filter((u) => audience.includes(u.userId)).map((u) => <option key={u.userId} value={u.userId}>{u.label}</option>)}</select></label>
    <button type="button" className={primaryClass} disabled={!canPublish} onClick={() => void publish()}>{c("이 결과를 검토에 공개", "Publish this result to review")}</button>
  </section>;
}
