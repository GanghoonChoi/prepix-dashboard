"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { DeliveryCheck, DeliveryDetail, DeliveryItem, DeliveryMediaIdentity, DeliveryOpenedItem, DeliveryReconfirm, TeamFileVersion, TeamNativeProject } from "@/lib/api/generated/b2b";
import { apiClient } from "@/lib/api/client";
import { b2bService } from "@/lib/api/services/b2b.service";
import { deliveryApi, deliveryEvents, deliveryService, deliveryStore } from "@/lib/api/services/b2b-delivery.service";
import { checkDelivery, runDelivery, type DeliveryAction, type DeliveryOperation, type DeliveryScope } from "@/lib/b2b-delivery/operations";
import { externalDeliveryItems, inspectDeliveryFiles, nativeDeliveryItems, verifiedOpenedItems } from "@/lib/b2b-delivery/files";
import { fileApi } from "@/lib/b2b-files/api";
import { useWorkspace } from "@/components/workspaces/workspace-context";
import { inputClass, primaryClass, secondaryClass, TeamLoading, TeamShell } from "@/components/workspaces/shared";
import { folderTabs, B2bError, useCopy } from "./shared";
import { kst, useLoader } from "./reviews";

type Copy = (ko: string, en: string) => string;
const code = (e: unknown) => {
  const message = (e as { response?: { data?: { message?: unknown } } })?.response?.data?.message;
  return typeof message === "string" ? message : e instanceof Error && e.message.startsWith("B2B_") ? e.message : "REQUEST_FAILED";
};
const messages: Record<string, [string, string]> = {
  B2B_DELIVERY_APPROVAL_REQUIRED: ["선택한 최종 영상 버전의 유효한 승인이 필요합니다.", "The exact final video needs a valid approval."],
  B2B_DELIVERY_REQUIRED_REQUESTS_PENDING: ["필수 요청의 확인 또는 사유 있는 면제를 마쳐야 합니다.", "Required requests need confirmation or a reasoned waiver."],
  B2B_DELIVERY_CONFIRMATION_REQUIRED: ["지정 수신자의 실제 열기 확인이 아직 없습니다.", "A designated recipient still needs to confirm an actual open."],
  B2B_DELIVERY_PACKAGE_STALE: ["최종 영상과 현재 제출 조건에 맞는 새 납품 목록이 필요합니다.", "A current delivery package matching this video and its rules is required."],
  B2B_DELIVERY_OTHER_ENVIRONMENT_REQUIRED: ["제출한 장치·작업 환경·작업 사본과 다른 곳에서 열어야 합니다.", "Open in a different device, environment and local copy than the submission."],
  B2B_DELIVERY_OPENED_FILES_MISMATCH: ["납품 목록의 모든 파일을 선택해야 합니다. 전체 내용 또는 크기가 다른 파일은 확인할 수 없습니다.", "Select every delivered file. Different contents or sizes cannot confirm delivery."],
  B2B_DELIVERY_SOURCE_MANIFEST_MISMATCH: ["작업 파일에 적힌 원본과 선택한 파일의 전체 내용이 일치하지 않습니다. 필요한 원본을 다시 선택해 주세요.", "The chosen files do not match the working file's source identities. Choose its exact sources."],
  B2B_DELIVERY_FILE_CHANGED: ["선택한 파일이 지정한 클라우드 버전과 다릅니다.", "The chosen file differs from the selected cloud version."],
  B2B_DELIVERY_MEASUREMENT_REQUIRED: ["외부 편집 도구에서 확인한 원본의 길이·크기·프레임률·오디오 채널을 입력해 주세요.", "Enter source measurements from the external editor."],
  B2B_DELIVERY_POLICY_NOT_CONFIGURED: ["납품 검증 설정이 아직 준비되지 않았습니다.", "Delivery verification is not configured yet."],
  B2B_DELIVERY_NATIVE_POLICY_NOT_CONFIGURED: ["PREPIX 작업 파일의 검증 설정이 아직 준비되지 않았습니다.", "PREPIX working-file verification is not configured yet."],
  B2B_DELIVERY_NATIVE_TOO_LARGE: ["작업 파일이 서버에 설정된 허용 크기보다 큽니다.", "The working file exceeds the configured size limit."],
  B2B_DELIVERY_OPERATION_PENDING: ["이전 전송의 결과가 확정되지 않았습니다. 아래에서 원래 내용으로 확인하거나 재시도해 주세요.", "An earlier change is unconfirmed. Check or retry its original intent below."],
  B2B_DELIVERY_STORAGE_UNAVAILABLE: ["이 브라우저에서 전송 내용을 안전하게 저장할 수 없습니다. 저장을 허용한 뒤 다시 시도해 주세요.", "This browser cannot preserve the submission. Enable storage and try again."],
  B2B_DELIVERY_SCOPE_CHANGED: ["계정 또는 팀·폴더가 바뀌었습니다. 현재 공간에서 다시 열어 주세요.", "The account, team or folder changed. Reopen from the current space."],
  B2B_DELIVERY_VIDEO_RECONFIRM_REQUIRED: ["재개 시 다시 확인하기로 한 영상에 새 승인이 필요합니다.", "The reopened video needs a fresh approval."],
  B2B_DELIVERY_REQUEST_RECONFIRM_REQUIRED: ["재개 시 선택한 요청을 새 기준과 확인 기록으로 다시 확인해 주세요.", "Reconfirm the reopened requests with current criteria and records."],
  B2B_DELIVERY_RECONFIRM_REQUIRED: ["다시 확인하기로 한 납품물을 새 목록과 열기 기록으로 제출해 주세요.", "Resubmit the reopened delivery with a new package and open records."],
};
function DeliveryError({ value, retry }: { value: string; retry?: () => void }) {
  const c = useCopy();
  if (!messages[value]) return <B2bError code={value} retry={retry} />;
  return <div role="alert" className="space-y-3 rounded-lg border border-border p-4 text-sm"><p>{c(...messages[value])}</p>{retry && <button type="button" className={secondaryClass} onClick={retry}>{c("다시 확인", "Check again")}</button>}</div>;
}
function deviceScope(): { deviceId: string; environmentId: string } {
  // Per browser profile, shared across accounts. These identify the client;
  // they do not prove that a file was opened or a physical device differs.
  const key = "prepix-delivery-browser-identity";
  try {
    const prior = localStorage.getItem(key);
    if (prior) return JSON.parse(prior);
    const next = { deviceId: `browser-${crypto.randomUUID()}`, environmentId: crypto.randomUUID() };
    localStorage.setItem(key, JSON.stringify(next));
    if (localStorage.getItem(key) !== JSON.stringify(next)) throw new Error();
    return next;
  } catch { throw new Error("B2B_DELIVERY_STORAGE_UNAVAILABLE"); }
}
type Mutate = (action: DeliveryAction, input: Record<string, unknown>, packageId?: string) => Promise<boolean>;
export function ProjectDelivery({ projectId }: { projectId: string }) {
  const ctx = useWorkspace()!;
  const me = ctx.data.currentUserId ?? "", workspaceId = ctx.data.workspace.id;
  const origin = new URL(apiClient.defaults.baseURL!).origin;
  if (!me || !ctx.b2b?.enrolled || !ctx.b2b.allowedActions.projects) return <B2bError code="B2B_PROJECT_NOT_FOUND" />;
  return <DeliveryScreen key={`${origin}:${me}:${workspaceId}:${projectId}`} scope={{ origin, userId: me, workspaceId, projectId }} />;
}
function DeliveryScreen({ scope }: { scope: DeliveryScope }) {
  const c = useCopy();
  const stable = useMemo(() => scope, [scope]);
  const read = useCallback(async () => {
    const detail = await deliveryService.detail(stable);
    const [project, files, people, capabilities] = await Promise.all([
      b2bService.project(stable.workspaceId, stable.projectId, stable.userId),
      fileApi(stable).versions(""),
      detail.allowedActions.propose ? b2bService.people(stable.workspaceId, stable.projectId) : Promise.resolve({ people: [], canManage: false }),
      detail.allowedActions.propose ? fileApi(stable).capabilities() : Promise.resolve(null),
    ]);
    return { detail, project: project.project, versions: files.versions, people: people.people, nativeMaxBytes: capabilities?.policy?.native?.maxBytes };
  }, [stable]);
  const { data, error, stale, load } = useLoader(read);
  const [videoVersionId, setVideo] = useState("");
  const [busy, setBusy] = useState(false), [mutationError, setMutationError] = useState("");
  const mutation = useCallback<Mutate>(async (action, input, packageId) => {
    if (!data || busy || stale) return false;
    setBusy(true); setMutationError("");
    try {
      await deliveryService.mutate(stable, action, { ...input, requestKey: crypto.randomUUID(), revision: data.detail.revision }, packageId);
      await load(); return true;
    } catch (e) { setMutationError(code(e)); await load(); return false; }
    finally { setBusy(false); }
  }, [stable, data, busy, stale, load]);
  const selected = videoVersionId || data?.detail.package?.videoVersionId || data?.detail.snapshots[0]?.evidence?.videoVersionId || "";
  const checkRead = useCallback(() => selected && data?.detail.allowedActions.complete ? deliveryService.check(stable, selected, data.detail.package?.id) : Promise.resolve(null), [stable, selected, data?.detail.allowedActions.complete, data?.detail.package?.id]);
  const conditions = useLoader(checkRead);
  const checkLoad = conditions.load;
  useEffect(() => {
    const changed = () => { void load(); void checkLoad(); };
    window.addEventListener(deliveryEvents, changed);
    return () => window.removeEventListener(deliveryEvents, changed);
  }, [load, checkLoad]);
  if (!data) return error ? <DeliveryError value={error} retry={() => void load()} /> : <TeamLoading />;
  const { detail, project, versions, people } = data;
  const base = `/dashboard/workspaces/${scope.workspaceId}/projects/${scope.projectId}`;
  const videos = versions.filter((v) => v.kind === "output" && v.metadata.video.length);
  const active = ["draft", "in_progress"].includes(detail.state);
  const disabled = busy || stale;
  return <TeamShell title={c("납품 확인과 폴더 완료", "Delivery and folder completion")} description={project.name} tabs={folderTabs(scope.workspaceId, project, c)}>
    {stale && <DeliveryError value={error} retry={() => void load()} />}
    {mutationError && <DeliveryError value={mutationError} />}
    <DeliveryPending scope={stable} onConfirmed={load} />
    <section className="space-y-3"><h2 className="font-medium">{c("완료 대상인 최종 영상", "Exact final video")}</h2><p className="text-sm text-muted">{c("선택한 버전의 승인, 필수 요청과 작업 파일 전달을 따로 확인합니다. 완료 직전에 서버가 같은 시점의 조건을 다시 검사합니다.", "The selected version's approval, required requests and working-file delivery are separate. The server rechecks every condition together before completion.")}</p>
      <label className="block space-y-2 text-sm"><span>{c("최종 영상 버전", "Final video version")}</span><select aria-label={c("최종 영상 버전", "Final video version")} className={inputClass} value={selected} disabled={disabled || !active} onChange={(e) => setVideo(e.target.value)}><option value="">{c("영상 선택", "Choose video")}</option>{videos.map((v) => <option key={v.id} value={v.id}>{v.assetName} · V{v.ordinal}</option>)}</select></label>
      {!videos.length && active && <p className="text-sm text-muted">{c("결과 영상으로 등록된 자료가 없습니다. 자료 화면에서 최종 결과를 등록해 주세요.", "No result video is registered. Register the final result on the files screen.")}</p>}
      {conditions.error && <DeliveryError value={code({ response: { data: { message: conditions.error } } })} retry={() => void conditions.load()} />}
      {conditions.data && <ConditionTable value={conditions.data} base={base} c={c} />}
      {conditions.data?.code && !conditions.data.satisfied && <DeliveryError value={conditions.data.code} />}
      {detail.allowedActions.complete && <button type="button" className={primaryClass} disabled={disabled || conditions.stale || !!conditions.error || !conditions.data?.satisfied || conditions.data.evidence?.videoVersionId !== selected || conditions.data.revision !== detail.revision} onClick={() => void mutation("complete", { videoVersionId: selected, ...(detail.package ? { packageId: detail.package.id } : {}) })}>{c("폴더 완료", "Complete folder")}</button>}
    </section>
    {detail.allowedActions.propose && <ProposePackage key={`propose:${detail.revision}`} scope={stable} versions={versions} people={people} nativeMaxBytes={data.nativeMaxBytes} videoVersionId={selected} disabled={disabled} mutate={mutation} />}
    {detail.package && <PackagePanel key={`package:${detail.package.id}:${detail.revision}`} scope={stable} detail={detail} disabled={disabled} mutate={mutation} />}
    <History detail={detail} base={base} c={c} />
    {detail.allowedActions.reopen && <ReopenForm key={`reopen:${detail.revision}`} detail={detail} disabled={disabled} mutate={mutation} />}
    <div className="space-y-3 border-t border-border pt-6"><p className="text-sm text-muted">{c("보관해도 파일은 저장 공간을 계속 사용합니다. 보관 해제는 완료 상태로 돌아가며, 편집하려면 사유를 남겨 작업을 재개해야 합니다.", "Archived files still use storage. Unarchiving restores the completed state; reopening with a reason is required for editing.")}</p>
      {detail.allowedActions.archive && <button type="button" className={secondaryClass} disabled={disabled} onClick={() => void mutation("archive", {})}>{c("완료한 폴더 보관", "Archive completed folder")}</button>}
      {detail.allowedActions.unarchive && <button type="button" className={secondaryClass} disabled={disabled} onClick={() => void mutation("unarchive", {})}>{c("보관 해제(완료 상태로)", "Unarchive to completed")}</button>}
    </div>
  </TeamShell>;
}
function ConditionTable({ value, base, c }: { value: DeliveryCheck; base: string; c: Copy }) {
  const rows = [
    { label: c("최종 영상 승인", "Final video approval"), result: value.conditions.approval, href: `${base}/reviews`, info: value.conditions.approval.evidence?.approvals.map((a) => `${c("회차", "Round")} ${a.round} · ${kst(a.decidedAt)}`).join(", ") },
    { label: c("필수 요청", "Required requests"), result: value.conditions.requests, href: `${base}/requests`, info: value.conditions.requests.evidence ? c(`확인 근거 ${value.conditions.requests.evidence.requests.length}건`, `${value.conditions.requests.evidence.requests.length} request records`) : "" },
    { label: c("편집 자료 전달", "Working-file delivery"), result: value.conditions.delivery, href: "#delivery-package", info: !value.conditions.delivery.required ? c("이 폴더는 최종 영상만 제출합니다", "This folder requires only the final video") : value.conditions.delivery.evidence ? c(`수신자 열기 확인 ${value.conditions.delivery.evidence.receipts.length}건`, `${value.conditions.delivery.evidence.receipts.length} recipient open receipts`) : "" },
  ];
  return <div className="space-y-3"><div className="overflow-x-auto"><table className="w-full min-w-80 text-left text-sm"><thead><tr className="border-b border-border"><th className="py-3 pr-3">{c("완료 항목", "Completion item")}</th><th className="py-3 pr-3">{c("확인 결과", "Status")}</th><th className="py-3">{c("근거", "Evidence")}</th></tr></thead><tbody>{rows.map((r) => <tr key={r.label} className="border-b border-border"><td className="py-4 pr-3 align-top">{r.label}</td><td className="py-4 pr-3 align-top">{r.result.satisfied ? c("충족", "Satisfied") : c("확인 필요", "Needs confirmation")}</td><td className="py-4 align-top"><p>{r.info || (r.result.code && messages[r.result.code] ? c(...messages[r.result.code]) : c("아직 확인 근거가 없습니다", "No evidence yet"))}</p><Link href={r.href} className="mt-2 inline-flex min-h-10 items-center underline underline-offset-4">{c("확인 기록 열기", "Open records")}</Link></td></tr>)}</tbody></table></div><ul className="space-y-2 text-sm">{value.conditions.requests.evidence?.requests.map((r, index) => <li key={r.requestId} className="space-y-1"><Link className="inline-flex min-h-10 items-center underline underline-offset-4" href={`${base}/requests/${r.requestId}`}>{c("필수 요청", "Required request")} {index + 1} · {c("기준", "Criteria")} {r.requestRevisionNumber} · {{ open: c("확인 전", "Open"), submitted: c("제출됨 · 확인 대기", "Submitted; awaiting confirmation"), confirmed: c("확인 완료", "Confirmed"), waived: c("사유 있는 면제", "Reasoned waiver") }[r.state]}</Link>{r.waiver && <p className="text-muted">{r.waiver.reason} · {kst(r.waiver.at)}</p>}{r.code && <p className="text-muted">{c("확인 근거가 현재 유효하지 않습니다", "Its evidence is no longer current")}</p>}</li>)}</ul></div>;
}
function DeliveryPending({ scope, onConfirmed }: { scope: DeliveryScope; onConfirmed: () => Promise<void> }) {
  const c = useCopy();
  const [rows, setRows] = useState<DeliveryOperation[]>([]), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const read = useCallback(async () => {
    try {
      let confirmed = false;
      const pending = await deliveryStore.list(scope);
      setRows(pending);
      for (const row of pending) confirmed = !!(await checkDelivery(row, deliveryApi(scope), deliveryStore)) || confirmed;
      setRows(await deliveryStore.list(scope)); setError("");
      if (confirmed) await onConfirmed();
    } catch (e) { setError(code(e)); }
  }, [scope, onConfirmed]);
  useEffect(() => { const start = setTimeout(() => void read(), 0), interval = setInterval(() => void read(), 15000); window.addEventListener(deliveryEvents, read); return () => { clearTimeout(start); clearInterval(interval); window.removeEventListener(deliveryEvents, read); }; }, [read]);
  if (!rows.length && !error) return null;
  const labels: Record<DeliveryAction, string> = { propose: c("납품 목록 제출", "Submit delivery package"), confirm: c("열기 확인", "Confirm open"), withdraw: c("확인 회수", "Withdraw confirmation"), complete: c("폴더 완료", "Complete folder"), reopen: c("작업 재개", "Reopen"), archive: c("보관", "Archive"), unarchive: c("보관 해제", "Unarchive") };
  return <section className="space-y-3 rounded-lg border border-border p-4" aria-label={c("결과 확인이 필요한 납품 변경", "Unconfirmed delivery changes")}><h2 className="font-medium">{c("결과 확인이 필요한 납품 변경", "Unconfirmed delivery changes")}</h2><p className="text-sm text-muted">{c("전송 전에 저장한 원래 내용과 키로만 조회·재시도합니다. 새 키로 완료나 확인을 다시 만들지 않습니다.", "Checks and retries use the saved original input and key. A new key never creates a second completion or confirmation.")}</p>{error && <DeliveryError value={error} />}<ul className="space-y-3">{rows.map((r) => <li key={`${r.action}:${r.packageId ?? ""}`} className="flex flex-wrap items-center justify-between gap-3"><span>{labels[r.action]}</span><div className="flex flex-wrap gap-2"><button type="button" className={secondaryClass} disabled={busy} onClick={() => void read()}>{c("결과 확인", "Check result")}</button><button type="button" className={secondaryClass} disabled={busy} onClick={async () => { setBusy(true); try { await runDelivery(r, deliveryApi(scope), deliveryStore); } catch (e) { setError(code(e)); } finally { setBusy(false); void read(); } }}>{c("원래 내용으로 다시 보내기", "Retry original intent")}</button></div></li>)}</ul></section>;
}
function ProposePackage({ scope, versions, people, nativeMaxBytes, videoVersionId, disabled, mutate }: { scope: DeliveryScope; versions: TeamFileVersion[]; people: { userId: string; name: string | null; email: string }[]; nativeMaxBytes?: number; videoVersionId: string; disabled: boolean; mutate: Mutate }) {
  const c = useCopy();
  const [mode, setMode] = useState<"native" | "external">("native"), [projectFile, setProjectFile] = useState<File | null>(null), [sourceFiles, setSourceFiles] = useState<File[]>([]), [resultFiles, setResultFiles] = useState<File[]>([]), [projectVersionId, setProjectVersion] = useState("");
  const [recipients, setRecipients] = useState<string[]>([]), [items, setItems] = useState<DeliveryItem[] | null>(null), [measurements, setMeasurements] = useState<Record<string, DeliveryMediaIdentity>>({});
  const [busy, setBusy] = useState(false), [progress, setProgress] = useState(""), [error, setError] = useState("");
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);
  const reset = () => setItems(null);
  return <section id="delivery-package" className="space-y-4 border-t border-border pt-6"><h2 className="font-medium">{c("납품 파일 목록 제출", "Submit delivery files")}</h2><p className="text-sm text-muted">{c("선택한 작업 파일과 원본의 전체 내용을 대조합니다. 이미 등록한 정확한 파일은 클라우드 버전에 고정하고 나머지는 외부 전달로 기록합니다. 제출은 수신자의 실제 열기 확인과 별개입니다.", "Checks the complete working-file and source contents. Exact registered files are fixed to cloud versions; other files are external deliveries. Submission is separate from a recipient's actual-open confirmation.")}</p>
    <label className="block space-y-2 text-sm"><span>{c("편집 도구", "Editing tool")}</span><select aria-label={c("편집 도구", "Editing tool")} className={inputClass} value={mode} disabled={disabled || busy} onChange={(e) => { setMode(e.target.value as "native" | "external"); reset(); }}><option value="native">PREPIX</option><option value="external">{c("다른 편집 도구", "Other editor")}</option></select></label>
    <label className="block space-y-2 text-sm"><span>{c("편집 가능한 작업 파일", "Editable project file")}</span><input className={inputClass} type="file" accept={mode === "native" ? ".prepixwork" : undefined} disabled={disabled || busy} onChange={(e) => { setProjectFile(e.target.files?.[0] ?? null); reset(); }} /></label>
    {mode === "native" && <label className="block space-y-2 text-sm"><span>{c("보관된 작업 파일 버전(선택)", "Registered working-file version (optional)")}</span><select aria-label={c("보관된 작업 파일 버전(선택)", "Registered working-file version (optional)")} className={inputClass} value={projectVersionId} disabled={disabled || busy} onChange={(e) => { setProjectVersion(e.target.value); reset(); }}><option value="">{c("외부에서 전달", "External delivery")}</option>{versions.filter((v) => v.kind === "working" && v.metadata.native).map((v) => <option key={v.id} value={v.id}>{v.assetName} · V{v.ordinal}</option>)}</select></label>}
    <label className="block space-y-2 text-sm"><span>{c("연결되는 원본 파일 전체", "All linked source files")}</span><input className={inputClass} type="file" multiple disabled={disabled || busy} onChange={(e) => { setSourceFiles(Array.from(e.target.files ?? [])); setMeasurements({}); reset(); }} /></label>
    {mode === "external" && sourceFiles.map((file, index) => { const m = measurements[String(index)] ?? { kind: "video", durationTicks: 0, width: 0, height: 0, frameRate: 0, audioChannels: 0 }; return <fieldset key={`${file.name}:${index}`} className="space-y-3 rounded-md border border-border p-3" disabled={disabled || busy}><legend className="px-1 text-sm">{file.name} · {c("편집 도구에서 확인한 원본 속성", "Source measurements in your editor")}</legend><select aria-label={`${file.name} ${c("종류", "type")}`} className={inputClass} value={m.kind} onChange={(e) => { setMeasurements({ ...measurements, [String(index)]: { ...m, kind: e.target.value as DeliveryMediaIdentity["kind"] } }); reset(); }}><option value="video">{c("영상", "Video")}</option><option value="audio">{c("오디오", "Audio")}</option><option value="image">{c("이미지", "Image")}</option></select><div className="grid gap-3 sm:grid-cols-3">{(["durationTicks", "width", "height", "frameRate", "audioChannels"] as const).map((key) => { const labels = { durationTicks: c("길이(초)", "Duration (seconds)"), width: c("가로", "Width"), height: c("세로", "Height"), frameRate: c("프레임률", "Frame rate"), audioChannels: c("오디오 채널", "Audio channels") }; return <label key={key} className="block space-y-2 text-sm"><span>{labels[key]}</span><input className={inputClass} type="number" min="0" step={key === "durationTicks" || key === "frameRate" ? "any" : "1"} value={key === "durationTicks" ? m[key] / 120000 : m[key]} onChange={(e) => { setMeasurements({ ...measurements, [String(index)]: { ...m, [key]: key === "durationTicks" ? Math.round(Number(e.target.value) * 120000) : Number(e.target.value) } }); reset(); }} /></label>; })}</div></fieldset>; })}
    <label className="block space-y-2 text-sm"><span>{c("함께 전달할 결과 파일(선택)", "Additional result files (optional)")}</span><input className={inputClass} type="file" multiple disabled={disabled || busy} onChange={(e) => { setResultFiles(Array.from(e.target.files ?? [])); reset(); }} /></label>
    <fieldset disabled={disabled || busy} className="space-y-2"><legend className="mb-2 text-sm">{c("실제로 받아서 확인할 사람", "Recipients who will open and check")}</legend>{people.filter((p) => p.userId !== scope.userId).map((p) => <label key={p.userId} className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" checked={recipients.includes(p.userId)} onChange={(e) => setRecipients(e.target.checked ? [...recipients, p.userId] : recipients.filter((id) => id !== p.userId))} />{p.name ?? p.email}</label>)}</fieldset>
    {error && <DeliveryError value={error} />}{progress && <p role="status" className="text-sm tabular-nums">{progress}</p>}
    <button type="button" className={secondaryClass} disabled={disabled || busy || !projectFile} onClick={async () => { const controller = new AbortController(); abort.current = controller; setBusy(true); setError(""); setItems(null); try { if (mode === "native" && !nativeMaxBytes) throw new Error("B2B_DELIVERY_NATIVE_POLICY_NOT_CONFIGURED"); if (mode === "native" && projectFile!.size > nativeMaxBytes!) throw new Error("B2B_DELIVERY_NATIVE_TOO_LARGE"); const progress = (name: string, done: number, total: number) => setProgress(`${name} · ${Math.round(done / total * 100)}%`); const [working] = await inspectDeliveryFiles([projectFile!], controller.signal, progress); const sources = await inspectDeliveryFiles(sourceFiles, controller.signal, progress), results = await inspectDeliveryFiles(resultFiles, controller.signal, progress); const next = mode === "native" ? nativeDeliveryItems(JSON.parse(await projectFile!.text()) as TeamNativeProject, working, sources, results, versions, projectVersionId || undefined) : externalDeliveryItems(working, sources.map((f, index) => { const media = measurements[String(index)]; if (!media) throw new Error("B2B_DELIVERY_MEASUREMENT_REQUIRED"); return { ...f, media, itemId: `source-${index}` }; }), results, versions); setItems(next); setProgress(c("전체 파일 내용 대조 완료 · 아직 제출되지 않았습니다", "File contents checked; not submitted yet")); } catch (e) { if (!controller.signal.aborted) setError(code(e)); } finally { setBusy(false); } }}>{c("파일 내용 대조", "Check file contents")}</button>
    {busy && <button type="button" className={secondaryClass} onClick={() => abort.current?.abort()}>{c("확인 중단", "Stop checking")}</button>}
    {items && <><Manifest items={items} c={c} /><button type="button" className={primaryClass} disabled={disabled || busy || !videoVersionId || !recipients.length} onClick={async () => { try { const client = deviceScope(); if (await mutate("propose", { videoVersionId, items, recipientIds: recipients, ...client, localCopyId: crypto.randomUUID() })) { setItems(null); setProgress(""); } } catch (e) { setError(code(e)); } }}>{c("선택한 목록을 납품 제출", "Submit this delivery package")}</button></>}
  </section>;
}
function Manifest({ items, c }: { items: DeliveryItem[]; c: Copy }) { const roles = { editing_project: c("편집 프로젝트", "Editing project"), source: c("원본", "Source"), result: c("결과물", "Result") }; return <ul className="divide-y divide-border border-y border-border text-sm">{items.map((i) => <li key={i.itemId} className="space-y-1 py-3"><p className="break-words">{i.name} · {roles[i.role]} · {i.location === "cloud" ? c("클라우드 정확한 버전", "Exact cloud version") : c("외부 전달", "External delivery")}</p><p className="break-all text-xs text-muted tabular-nums">{i.size.toLocaleString()} B · SHA-256 {i.sha256}</p>{i.media && <p className="text-xs text-muted">{i.media.width} × {i.media.height} · {(i.media.durationTicks / 120000).toFixed(3)}s · {i.media.frameRate}fps · {i.media.audioChannels}ch</p>}</li>)}</ul>; }
function PackagePanel({ scope, detail, disabled, mutate }: { scope: DeliveryScope; detail: DeliveryDetail; disabled: boolean; mutate: Mutate }) {
  const c = useCopy(), p = detail.package!;
  const [reason, setReason] = useState("");
  return <section className="space-y-4 border-t border-border pt-6"><h2 className="font-medium">{c("현재 납품 목록과 열기 확인", "Current package and open receipts")}</h2><Manifest items={p.items} c={c} /><p className="text-sm text-muted">{c(`지정 수신자 ${p.recipients.length}명 · 제출 ${kst(p.createdAt)}`, `${p.recipients.length} recipients · submitted ${kst(p.createdAt)}`)}</p>
    <ul className="space-y-3 text-sm">{detail.receipts.map((r) => { const invalid = detail.invalidations.find((x) => !x.receiptId || x.receiptId === r.id); return <li key={r.id} className="space-y-2 rounded-md border border-border p-3"><p>{r.sourceKind === "native_app_verified" ? c("PREPIX 앱 열기 검증 기록", "PREPIX app verified-open record") : c("외부 편집 도구 열기 확인 기록", "External-editor open attestation")} · {r.tool} {r.toolVersion}</p><p className="text-muted">{c("확인자", "Recipient")}: {r.userId} · {kst(r.openedAt)}</p>{invalid ? <p>{c("회수됨", "Withdrawn")}: {invalid.reason}</p> : detail.allowedActions.withdraw && (r.userId === scope.userId || detail.allowedActions.complete || detail.allowedActions.reopen) && <button type="button" className={secondaryClass} disabled={disabled || !reason.trim()} onClick={() => void mutate("withdraw", { receiptId: r.id, reason }, p.id)}>{c("이 열기 확인 회수", "Withdraw this open receipt")}</button>}</li>; })}</ul>
    {detail.invalidations.filter((i) => !i.receiptId).map((i) => <p key={i.id} className="text-sm">{c("목록 회수 사유", "Package withdrawal reason")}: {i.reason}</p>)}
    {detail.allowedActions.confirm && <ExternalOpen detail={detail} disabled={disabled} mutate={mutate} />}
    {detail.allowedActions.withdraw && <div className="space-y-3"><label className="block space-y-2 text-sm"><span>{c("납품·확인 회수 사유", "Delivery/receipt withdrawal reason")}</span><input className={inputClass} value={reason} maxLength={2000} onChange={(e) => setReason(e.target.value)} /></label>{(p.producerId === scope.userId || detail.allowedActions.complete || detail.allowedActions.reopen) && <button type="button" className={secondaryClass} disabled={disabled || !reason.trim()} onClick={() => void mutate("withdraw", { reason }, p.id)}>{c("현재 납품 목록 회수", "Withdraw current package")}</button>}</div>}
  </section>;
}
function ExternalOpen({ detail, disabled, mutate }: { detail: DeliveryDetail; disabled: boolean; mutate: Mutate }) {
  const c = useCopy(), p = detail.package!;
  const [files, setFiles] = useState<File[]>([]), [openedItems, setOpened] = useState<DeliveryOpenedItem[] | null>(null), [tool, setTool] = useState(""), [version, setVersion] = useState(""), [openedAt, setOpenedAt] = useState(""), [attested, setAttested] = useState(false);
  const [progress, setProgress] = useState(""), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);
  return <form className="space-y-3 rounded-lg border border-border p-4" onSubmit={async (e) => { e.preventDefault(); if (!openedItems) return; try { const identity = deviceScope(); if (identity.deviceId === p.deviceId || identity.environmentId === p.environmentId) throw new Error("B2B_DELIVERY_OTHER_ENVIRONMENT_REQUIRED"); const ok = await mutate("confirm", { manifestHash: p.manifestHash, sourceKind: "external_tool_attestation", tool: tool.trim(), toolVersion: version.trim(), ...identity, localCopyId: crypto.randomUUID(), openedAt: new Date(openedAt).toISOString(), openedItems }, p.id); if (ok) { setOpened(null); setAttested(false); } } catch (e) { setError(code(e)); } }}>
    <h3 className="font-medium">{c("다른 작업 환경에서 실제 열기 확인", "Confirm an actual open in another environment")}</h3><p className="text-sm text-muted">{c("다른 장치·작업 환경에서 편집 프로젝트와 연결된 원본을 실제로 연 수신자가 남기는 외부 도구 확인입니다. 선택한 모든 파일의 전체 내용도 납품 목록과 대조합니다. PREPIX 앱 자동 검증이나 편집 도구 간 변환을 의미하지 않습니다.", "This is the recipient's attestation that the project and linked media were actually opened in another device and environment. Every selected file's contents must also match. It is separate from PREPIX app verification or editor conversion.")}</p>
    <label className="block space-y-2 text-sm"><span>{c("실제로 연 납품 파일 전체", "All delivered files actually opened")}</span><input className={inputClass} type="file" multiple disabled={disabled || busy} onChange={(e) => { setFiles(Array.from(e.target.files ?? [])); setOpened(null); setAttested(false); }} /></label>
    <button type="button" className={secondaryClass} disabled={disabled || busy || !files.length} onClick={async () => { const controller = new AbortController(); abort.current = controller; setBusy(true); setOpened(null); setError(""); try { setOpened(verifiedOpenedItems(p.items, await inspectDeliveryFiles(files, controller.signal, (name, done, total) => setProgress(`${name} · ${Math.round(done / total * 100)}%`)))); setProgress(c("납품 목록의 전체 파일과 일치합니다. 실제 열기 기록을 입력해 주세요.", "Every delivered file matches. Enter the actual-open details.")); } catch (e) { if (!controller.signal.aborted) setError(code(e)); } finally { setBusy(false); } }}>{c("받은 파일의 전체 내용 대조", "Check complete received contents")}</button>
    {busy && <button type="button" className={secondaryClass} onClick={() => abort.current?.abort()}>{c("확인 중단", "Stop checking")}</button>}{progress && <p role="status" className="text-sm tabular-nums">{progress}</p>}
    <div className="grid gap-3 sm:grid-cols-2"><label className="block space-y-2 text-sm"><span>{c("실제로 연 편집 도구", "Editor actually used")}</span><input className={inputClass} value={tool} maxLength={100} disabled={disabled} onChange={(e) => setTool(e.target.value)} /></label><label className="block space-y-2 text-sm"><span>{c("편집 도구 버전", "Editor version")}</span><input className={inputClass} value={version} maxLength={100} disabled={disabled} onChange={(e) => setVersion(e.target.value)} /></label></div>
    <label className="block space-y-2 text-sm"><span>{c("실제로 연 시각(이 장치의 현지 시간)", "Actual-open time (this device's local time)")}</span><input type="datetime-local" className={inputClass} value={openedAt} disabled={disabled} onChange={(e) => setOpenedAt(e.target.value)} /></label>
    <label className="flex min-h-11 items-start gap-3 text-sm"><input type="checkbox" className="mt-1" checked={attested} disabled={disabled || !openedItems} onChange={(e) => setAttested(e.target.checked)} /><span>{c("제출한 곳과 다른 실제 장치·작업 환경에서 편집 프로젝트와 연결된 원본 전체를 열어 사용할 수 있음을 직접 확인했습니다.", "I personally opened the editable project and every linked original in a different actual device and environment and confirmed they can be used.")}</span></label>
    {error && <DeliveryError value={error} />}<button type="submit" className={primaryClass} disabled={disabled || busy || !openedItems || !attested || !tool.trim() || !version.trim() || !openedAt}>{c("외부 도구 열기 확인 기록 제출", "Submit external-editor open attestation")}</button>
  </form>;
}
function History({ detail, base, c }: { detail: DeliveryDetail; base: string; c: Copy }) { return <section className="space-y-4 border-t border-border pt-6"><h2 className="font-medium">{c("완료와 재개 기록", "Completion and reopen history")}</h2>{!detail.snapshots.length && <p className="text-sm text-muted">{c("아직 완료 근거가 생성되지 않았습니다.", "No completion snapshot exists yet.")}</p>}<ul className="space-y-4">{detail.snapshots.map((s) => <li key={s.id} className="space-y-3 rounded-lg border border-border p-4 text-sm"><p>{c("완료", "Completed")} {kst(s.createdAt)} · {c("완료자", "Completed by")} {s.completedBy}</p>{s.evidence ? <><p>{c(`영상 승인 ${s.evidence.approval.approvals.length}건 · 필수 요청 ${s.evidence.requests.requests.length}건 · 작업 파일 ${s.evidence.requiresWorkingFiles ? "필수" : "선택"}`, `${s.evidence.approval.approvals.length} approvals · ${s.evidence.requests.requests.length} required-request records · working files ${s.evidence.requiresWorkingFiles ? "required" : "optional"}`)}</p>{s.evidence.delivery && <Manifest items={s.evidence.delivery.items} c={c} />}<Link href={`${base}/reviews`} className="inline-flex min-h-10 items-center underline underline-offset-4">{c("영상 승인 기록", "Video approval records")}</Link></> : <p className="text-muted">{c("현재 권한으로 세부 파일 근거를 열 수 없습니다. 완료 기록은 보존됩니다.", "Current access does not permit detailed file evidence. The completion record is preserved.")}</p>}</li>)}</ul><ul className="space-y-3 text-sm">{detail.reopens.map((r) => <li key={r.id} className="space-y-1 border-l-2 border-border pl-4"><p>{c("작업 재개", "Reopened")} · {kst(r.createdAt)} · {r.reason}</p><p className="text-muted">{[r.reconfirm.video && c("영상 재승인", "Fresh video approval"), r.reconfirm.delivery && c("납품 재확인", "Delivery reconfirmation"), r.reconfirm.requestIds.length > 0 && c(`요청 재확인 ${r.reconfirm.requestIds.length}건`, `${r.reconfirm.requestIds.length} request reconfirmations`)].filter(Boolean).join(" · ")}</p></li>)}</ul></section>; }
function ReopenForm({ detail, disabled, mutate }: { detail: DeliveryDetail; disabled: boolean; mutate: Mutate }) {
  const c = useCopy(), snapshot = detail.snapshots[0]?.evidence;
  const [reason, setReason] = useState(""), [reconfirm, setReconfirm] = useState<DeliveryReconfirm>({ video: false, delivery: false, requestIds: [] });
  return <form className="space-y-3 border-t border-border pt-6" onSubmit={async (e) => { e.preventDefault(); await mutate("reopen", { reason: reason.trim(), reconfirm }); }}><h2 className="font-medium">{c("사유를 남기고 작업 재개", "Reopen work with a reason")}</h2><p className="text-sm text-muted">{c("이전 완료 기록은 유지합니다. 다시 확인할 항목을 직접 선택하고 새 승인·납품·요청 확인을 받아야 다시 완료할 수 있습니다.", "Earlier completion records remain. Select the items to reconfirm; fresh approval, delivery or request evidence is required before completing again.")}</p><label className="block space-y-2 text-sm"><span>{c("재개 사유(필수)", "Reopen reason (required)")}</span><textarea className={`${inputClass} min-h-24`} value={reason} maxLength={2000} disabled={disabled} onChange={(e) => setReason(e.target.value)} /></label><fieldset disabled={disabled || !snapshot} className="space-y-2"><legend className="mb-2 text-sm">{c("다시 확인할 항목", "Items to reconfirm")}</legend><label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" checked={reconfirm.video} onChange={(e) => setReconfirm({ ...reconfirm, video: e.target.checked })} />{c("최종 영상 승인", "Final video approval")}</label>{snapshot?.delivery && <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" checked={reconfirm.delivery} onChange={(e) => setReconfirm({ ...reconfirm, delivery: e.target.checked })} />{c("편집 자료 전달·열기 확인", "Working-file delivery and open confirmation")}</label>}{snapshot?.requests.requests.map((r) => <label key={r.requestId} className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" checked={reconfirm.requestIds.includes(r.requestId)} onChange={(e) => setReconfirm({ ...reconfirm, requestIds: e.target.checked ? [...reconfirm.requestIds, r.requestId] : reconfirm.requestIds.filter((id) => id !== r.requestId) })} />{c("필수 요청", "Required request")} {r.requestId}</label>)}</fieldset><button type="submit" className={primaryClass} disabled={disabled || !snapshot || !reason.trim() || (!reconfirm.video && !reconfirm.delivery && !reconfirm.requestIds.length)}>{c("선택한 항목으로 작업 재개", "Reopen with selected reconfirmations")}</button></form>;
}
