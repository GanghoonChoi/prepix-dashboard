import type { DeliveryItem, DeliveryMediaIdentity, DeliveryOpenedItem, TeamFileVersion, TeamNativeProject } from "../api/generated/b2b";
import { fileDigestOffThread } from "../workspaces/upload";
export type InspectedDeliveryFile = { file: File; size: number; sha256: string };
export async function inspectDeliveryFiles(files: File[], signal: AbortSignal, onProgress: (name: string, done: number, size: number) => void) {
  const rows: InspectedDeliveryFile[] = [];
  for (const file of files) {
    signal.throwIfAborted();
    if (!file.size) throw new Error("B2B_DELIVERY_EMPTY_FILE");
    rows.push({ file, size: file.size, sha256: await fileDigestOffThread(file, signal, (done) => onProgress(file.name, done, file.size)) });
  }
  return rows;
}
function sourceMedia(source: TeamNativeProject["sources"][number]): DeliveryMediaIdentity {
  return { kind: source.kind, durationTicks: source.durationTicks, width: source.width, height: source.height, frameRate: source.frameRate, audioChannels: source.audioChannels };
}
function located(identity: { size: number; sha256: string }, versions: TeamFileVersion[], preferredId?: string) {
  const v = preferredId ? versions.find((v) => v.id === preferredId) : versions.find((v) => v.size === identity.size && v.sha256 === identity.sha256);
  if (preferredId && (!v || v.size !== identity.size || v.sha256 !== identity.sha256)) throw new Error("B2B_DELIVERY_FILE_CHANGED");
  return { location: v ? "cloud" as const : "external" as const, versionId: v?.id ?? null };
}
/** Reference identities must match the full bytes chosen on this device.
 * This is a proposal, never an actual-open receipt or a server registration. */
export function nativeDeliveryItems(document: TeamNativeProject, projectFile: InspectedDeliveryFile, sources: InspectedDeliveryFile[], results: InspectedDeliveryFile[], versions: TeamFileVersion[], projectVersionId?: string): DeliveryItem[] {
  if (document.format !== "prepix-team-project" || document.formatVersion !== 1 || !Array.isArray(document.sources)) throw new Error("B2B_DELIVERY_NATIVE_REQUIRED");
  const project: DeliveryItem = { itemId: "editing-project", role: "editing_project", name: projectFile.file.name, size: projectFile.size, sha256: projectFile.sha256, ...(projectVersionId ? located(projectFile, versions, projectVersionId) : { location: "external" as const, versionId: null }) };
  const items: DeliveryItem[] = [project];
  for (const source of document.sources) {
    const file = sources.find((f) => f.size === source.size && f.sha256 === source.sha256);
    if (!file || !source.mediaId || !["video", "audio", "image"].includes(source.kind) || !Number.isSafeInteger(source.durationTicks) || !Number.isFinite(source.frameRate)) throw new Error("B2B_DELIVERY_SOURCE_MANIFEST_MISMATCH");
    items.push({ itemId: source.mediaId, role: "source", name: source.name, size: file.size, sha256: file.sha256, media: sourceMedia(source), ...located(file, versions) });
  }
  for (const [index, result] of results.entries()) items.push({ itemId: `result-${index}`, role: "result", name: result.file.name, size: result.size, sha256: result.sha256, ...located(result, versions) });
  if (new Set(items.map((i) => i.itemId)).size !== items.length) throw new Error("B2B_DELIVERY_INPUT_INVALID");
  return items;
}
/** Every delivered item needs matching complete bytes. Hashes are compared,
 * so names and paths cannot act as evidence. Supplied media measurements are
 * tied to those exact bytes; the external-tool open remains an attestation. */
export function verifiedOpenedItems(items: DeliveryItem[], inspected: InspectedDeliveryFile[]): DeliveryOpenedItem[] {
  return items.map((item) => {
    if (!inspected.some((file) => file.size === item.size && file.sha256 === item.sha256)) throw new Error("B2B_DELIVERY_OPENED_FILES_MISMATCH");
    return { itemId: item.itemId, size: item.size, sha256: item.sha256, ...(item.media ? { media: item.media } : {}) };
  });
}
export function externalDeliveryItems(projectFile: InspectedDeliveryFile, sources: (InspectedDeliveryFile & { media: DeliveryMediaIdentity; itemId: string })[], results: InspectedDeliveryFile[], versions: TeamFileVersion[]): DeliveryItem[] {
  const items: DeliveryItem[] = [{ itemId: "editing-project", role: "editing_project", name: projectFile.file.name, size: projectFile.size, sha256: projectFile.sha256, location: "external", versionId: null }];
  for (const source of sources) {
    const m = source.media;
    if (!["video", "audio", "image"].includes(m.kind) || !Number.isSafeInteger(m.durationTicks) || m.durationTicks < 0 || !Number.isFinite(m.frameRate) || m.frameRate < 0 || ![m.width, m.height, m.audioChannels].every((n) => Number.isSafeInteger(n) && n >= 0)) throw new Error("B2B_DELIVERY_MEASUREMENT_REQUIRED");
    items.push({ itemId: source.itemId, role: "source", name: source.file.name, size: source.size, sha256: source.sha256, media: m, ...located(source, versions) });
  }
  for (const [index, result] of results.entries()) items.push({ itemId: `result-${index}`, role: "result", name: result.file.name, size: result.size, sha256: result.sha256, ...located(result, versions) });
  return items;
}
