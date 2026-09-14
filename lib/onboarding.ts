/**
 * Where someone is in first-run.
 *
 * There is no "personal vs team" mode here any more, and that absence is the
 * design. Every authenticated account has exactly one workspace, provisioned
 * for them; solo is that workspace with one member, and someone joining is what
 * makes it a team. Offering the two as a choice is what produces the Figma-style
 * question "where does my file live" — which prepix does not have to answer at
 * all, because the real personal space is the user's own machine and it works
 * signed out.
 *
 * So this is a position in one sequence, not a branch:
 *
 *   join      offered only when there is something to join. Skippable.
 *   workspace the provisioned workspace, with its name editable in place.
 *   invite    explicit, skippable.
 *   app       the finish line — the real work happens in the desktop app.
 *   edit      the first-edit guide, reached from `app` once it is installed.
 */
export type StartStep = "join" | "workspace" | "invite" | "app" | "edit";

const STEPS: StartStep[] = ["join", "workspace", "invite", "app", "edit"];

export type StartState = {
  step: StartStep;
  workspace: string | null;
};

/** URLs only carry navigation intent. Membership always comes from the API. */
export function readStartState(search: string): StartState {
  const params = new URLSearchParams(search);
  const workspace = params.get("workspace");
  const validWorkspace =
    workspace &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      workspace,
    )
      ? workspace
      : null;
  const step = params.get("step");
  return {
    step: STEPS.find((known) => known === step) ?? "join",
    workspace: validWorkspace,
  };
}

export function startHref(state: StartState, locale: string): string {
  const params = new URLSearchParams({ locale });
  if (state.step !== "join") params.set("step", state.step);
  if (state.workspace) params.set("workspace", state.workspace);
  return `/start?${params}`;
}
