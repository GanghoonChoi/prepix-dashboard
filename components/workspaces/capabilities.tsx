"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import {
  workspaceService,
  type Capabilities,
} from "@/lib/api/services/workspace.service";
import { capabilityFailure } from "@/lib/workspaces/errors";

/**
 * Two different failures used to render as the same thing.
 *
 * A 404 means the server predates team workspaces — "absent" is the correct,
 * final answer and the disabled copy is right. A timeout, a dropped connection
 * or a 5xx means we never got an answer, and collapsing that into "absent"
 * told people the team product does not exist and hid the nav entry with no
 * way back. Those become "unreachable", which offers a retry.
 */
export type CapabilityStatus = "loading" | "ready" | "absent" | "unreachable";

const Context = createContext<{
  capabilities: Capabilities | null;
  loaded: boolean;
  status: CapabilityStatus;
  reload: () => void;
}>({
  capabilities: null,
  loaded: false,
  status: "loading",
  reload: () => {},
});

export function WorkspaceCapabilities({
  children,
}: {
  children: React.ReactNode;
}) {
  const [capabilities, setCapabilities] = useState<Capabilities | null>(null);
  const [status, setStatus] = useState<CapabilityStatus>("loading");
  const [attempt, setAttempt] = useState(0);
  const reload = useCallback(() => {
    setStatus("loading");
    setAttempt((value) => value + 1);
  }, []);
  useEffect(() => {
    let active = true;
    workspaceService
      .capabilities()
      .then((next) => {
        if (!active) return;
        setCapabilities(next);
        setStatus("ready");
      })
      .catch((error) => {
        if (!active) return;
        setCapabilities(null);
        setStatus(capabilityFailure(error));
      });
    return () => {
      active = false;
    };
  }, [attempt]);
  return (
    <Context.Provider
      value={{ capabilities, loaded: status !== "loading", status, reload }}
    >
      {children}
    </Context.Provider>
  );
}

export const useWorkspaceCapabilities = () => useContext(Context);
