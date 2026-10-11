"use client";
import { useCallback, useEffect, useState } from "react";
import { Laptop } from "lucide-react";
import {
  b2bService,
  type EditingDeviceOverview,
} from "@/lib/api/services/b2b.service";
import { useWorkspace } from "@/components/workspaces/workspace-context";
import { Badge, Button } from "@/components/ui";
import { useI18n } from "@/lib/i18n/context";
import { formatDate } from "@/lib/format";
import { B2bError, errorCode, useCopy } from "./shared";

/**
 * 내 등록 장치 (2026-10-08): the computers this seat edits on. Retiring one
 * frees its place for a new computer. It lived on the retired 편집 이용권
 * page; it is the one part of that page a member ever needed. Absent when
 * there is nothing to show.
 */
export function MyDevices() {
  const { data } = useWorkspace()!;
  const c = useCopy();
  const { lang } = useI18n();
  const id = data.workspace.id;
  const [overview, setOverview] = useState<EditingDeviceOverview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    try {
      setOverview(await b2bService.editingDevices(id));
    } catch {
      setOverview(null);
    }
  }, [id]);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);
  const devices = (overview?.devices ?? []).filter((d) => d.state !== "retired");
  if (!devices.length) return null;
  return (
    <section className="space-y-3" aria-label={c("내 등록 장치", "My devices")}>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-base font-semibold">{c("내 등록 장치", "My devices")}</h2>
        {overview?.deviceLimit != null && (
          <span className="text-[13px] tabular-nums text-muted">
            {devices.length} / {overview.deviceLimit}
          </span>
        )}
      </div>
      <ul className="divide-y divide-border border-y border-border">
        {devices.map((device) => (
          <li key={device.id} className="flex flex-wrap items-center gap-3 py-3 text-[13px]">
            <span className="grid size-9 shrink-0 place-items-center rounded-md bg-surface-secondary text-muted">
              <Laptop size={16} strokeWidth={1.75} aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-2 font-medium">
                {c(`장치 ${device.id.slice(0, 8)}`, `Device ${device.id.slice(0, 8)}`)}
                {device.state === "retiring" && (
                  <Badge tone="warning" dot>
                    {c("해제 중", "Retiring")}
                  </Badge>
                )}
              </p>
              <p className="text-xs text-muted tabular-nums">{formatDate(device.createdAt, lang)}</p>
            </div>
            {device.state === "active" && (
              <Button
                variant="secondary"
                size="sm"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  setError("");
                  try {
                    await b2bService.retireEditingDevice(id, device.id, {
                      requestKey: crypto.randomUUID(),
                      revision: device.revision,
                      reason: "장치 등록 해제",
                    });
                  } catch (e) {
                    setError(errorCode(e));
                  } finally {
                    setBusy(false);
                    await load();
                  }
                }}
              >
                {c("등록 해제", "Remove")}
              </Button>
            )}
          </li>
        ))}
      </ul>
      <p className="text-xs leading-5 text-muted">
        {c(
          "해제한 컴퓨터는 더 이상 편집할 수 없고, 그 자리에 새 컴퓨터를 등록할 수 있습니다.",
          "A removed computer can no longer edit, and frees a place for a new one.",
        )}
      </p>
      {error && <B2bError code={error} />}
    </section>
  );
}
