"use client";
import { useRef, useState } from "react";
import {
  workspaceService,
  type Workspace,
  type Capabilities,
} from "@/lib/api/services/workspace.service";
import { workspaceError } from "@/lib/workspaces/onboarding";

type Intent = {
  name: string;
  requestKey: string;
  keyed: boolean;
  workspace?: Workspace;
};

/** Hold the original intent until creation and the destination transition are known. */
export function useTeamCreation(capabilities: Capabilities | null) {
  const intent = useRef<Intent | null>(null);
  const sending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function submit(
    name: string,
    completed: (workspace: Workspace) => void | Promise<void>,
  ) {
    if (sending.current) return;
    sending.current = true;
    setBusy(true);
    setError("");
    intent.current ??= {
      name: name.trim(),
      requestKey: crypto.randomUUID(),
      keyed: capabilities?.creationRequestKeys === true,
    };
    setPending(true);
    const request = intent.current;
    try {
      request.workspace ??= (
        await workspaceService.create(
          request.name,
          request.keyed ? request.requestKey : undefined,
        )
      ).workspace;
      await completed(request.workspace);
      intent.current = null;
      setPending(false);
    } catch (e) {
      const status = (e as { response?: { status?: number } })?.response
        ?.status;
      if (
        !request.workspace &&
        typeof status === "number" &&
        status >= 400 &&
        status < 500 &&
        status !== 408 &&
        status !== 429
      ) {
        intent.current = null;
        setPending(false);
      }
      setError(workspaceError(e));
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }
  return { submit, busy, pending, error };
}
