"use client";
import { useEffect, useRef, useState } from "react";
import { apiClient } from "@/lib/api/client";
import {
  workspaceService,
  type Workspace,
  type Capabilities,
} from "@/lib/api/services/workspace.service";
import { workspaceError } from "@/lib/workspaces/onboarding";
import { freeIntent, readApiSession } from "@/lib/api/session";

type Intent = {
  name: string;
  requestKey: string;
  keyed: boolean;
  workspace?: Workspace;
};

/** Hold the original intent until creation and the destination transition are known. */
export function useTeamCreation(capabilities: Capabilities | null) {
  const intent = useRef<Intent | null>(null);
  // This page is outside WorkspaceProvider: it pins the account it was drawn
  // for and drops its intent when another tab signs in as someone else.
  const owner = useRef<ReturnType<typeof readApiSession> | null>(null);
  owner.current ??= readApiSession(apiClient.defaults.baseURL!);
  const sending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const moved = () => {
      const now = readApiSession(apiClient.defaults.baseURL!);
      if (
        now.userId === owner.current!.userId &&
        now.lineage === owner.current!.lineage
      )
        return;
      owner.current = now;
      intent.current = null;
      setPending(false);
      setError("");
    };
    window.addEventListener("storage", moved);
    return () => window.removeEventListener("storage", moved);
  }, []);
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
          owner.current!.userId ?? undefined,
        )
      ).workspace;
      await completed(request.workspace);
      intent.current = null;
      setPending(false);
    } catch (e) {
      if (!request.workspace && freeIntent(request, e)) {
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
