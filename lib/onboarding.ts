export type StartState = {
  mode: "choose" | "personal" | "team";
  step: "install" | "edit";
  workspace: string | null;
};

/** URLs only carry navigation intent. Membership always comes from the API. */
export function readStartState(search: string): StartState {
  const params = new URLSearchParams(search);
  const workspace = params.get("workspace");
  const validWorkspace =
    workspace && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(workspace)
      ? workspace
      : null;
  const mode = params.get("mode");
  return {
    mode: validWorkspace || mode === "team" ? "team" : mode === "personal" ? "personal" : "choose",
    step: params.get("step") === "edit" ? "edit" : "install",
    workspace: validWorkspace,
  };
}
export function startHref(state: StartState, locale: string): string {
  const params = new URLSearchParams({ locale });
  if (state.mode !== "choose") params.set("mode", state.mode);
  if (state.step === "edit") params.set("step", "edit");
  if (state.workspace) params.set("workspace", state.workspace);
  return `/start?${params}`;
}
