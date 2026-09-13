"use client";
import { createContext, useContext, useEffect, useState } from "react";
import {
  workspaceService,
  type Capabilities,
} from "@/lib/api/services/workspace.service";
const Context = createContext<{
  capabilities: Capabilities | null;
  loaded: boolean;
}>({ capabilities: null, loaded: false });
export function WorkspaceCapabilities({
  children,
}: {
  children: React.ReactNode;
}) {
  const [value, setValue] = useState<{
    capabilities: Capabilities | null;
    loaded: boolean;
  }>({ capabilities: null, loaded: false });
  useEffect(() => {
    let active = true;
    workspaceService
      .capabilities()
      .then((capabilities) => {
        if (active) setValue({ capabilities, loaded: true });
      })
      .catch(() => {
        if (active) setValue({ capabilities: null, loaded: true });
      });
    return () => {
      active = false;
    };
  }, []);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export const useWorkspaceCapabilities = () => useContext(Context);
