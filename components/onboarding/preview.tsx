"use client";
import { AnimatePresence, motion } from "framer-motion";
import {
  Clapperboard,
  CreditCard,
  Film,
  FolderClosed,
  House,
  Mic,
  Scissors,
  Settings,
  Smartphone,
  Users,
} from "lucide-react";
import { useI18n } from "@/lib/i18n/context";
import type { Intent } from "@/lib/onboarding";
import { formatMoney } from "@/lib/format";

/**
 * The right half of /start: the workspace being made, drawn as it will look,
 * updating as the left half is filled in. Purely decorative — every fact it
 * shows is also on the left — so it is hidden from assistive tech.
 */
export type PreviewState = {
  intent: Intent | null;
  name: string;
  /** The account's own address, then everyone invited so far. */
  people: string[];
  seats: { count: number; supplyKrw: number } | null;
  /** The app steps draw the desktop app instead of the web workspace. */
  surface: "workspace" | "app";
  /** On the first-edit step, the step of it being acted out in the app. */
  scene?: AppScene | null;
};

/** The first-edit steps, each drawn as its own moment in the app. */
export type AppScene = "open" | "project" | "import" | "cut";

const initial = (value: string) =>
  (value.trim()[0] ?? "P").toLocaleUpperCase();

const windowClass =
  "relative w-[min(660px,100%)] overflow-hidden rounded-l-lg border border-r-0 border-border bg-background";

export function StartPreview({ state }: { state: PreviewState }) {
  return (
    <aside
      aria-hidden="true"
      className="relative flex min-h-0 flex-1 items-center justify-end overflow-hidden py-10 pl-12"
    >
      {/* Dot grid fading out from the centre, and one soft light above it. */}
      <div className="pointer-events-none absolute inset-0 [background-image:radial-gradient(var(--surface-tertiary)_1px,transparent_1px)] [background-size:22px_22px] [mask-image:radial-gradient(ellipse_at_center,black_35%,transparent_75%)]" />
      <div className="pointer-events-none absolute -top-48 left-1/2 h-96 w-[40rem] -translate-x-1/2 rounded-full bg-foreground/[0.05] blur-3xl" />
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={state.surface}
          className="relative flex w-full justify-end"
          initial={{ opacity: 0, y: 8, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.22, ease: "easeOut" }}
        >
          {state.surface === "app" ? (
            <AppWindow scene={state.scene ?? null} email={state.people[0] ?? ""} />
          ) : (
            <WorkspaceWindow state={state} />
          )}
        </motion.div>
      </AnimatePresence>
    </aside>
  );
}

function WindowBar({ label }: { label: string }) {
  return (
    <div className="flex h-9 items-center gap-1.5 border-b border-border px-3.5">
      <span className="size-2.5 rounded-full bg-surface-tertiary" />
      <span className="size-2.5 rounded-full bg-surface-tertiary" />
      <span className="size-2.5 rounded-full bg-surface-tertiary" />
      <span className="ml-3 truncate font-mono text-[11px] text-muted">{label}</span>
    </div>
  );
}

function WorkspaceWindow({ state }: { state: PreviewState }) {
  const { lang } = useI18n();
  const copy = (en: string, ko: string) => (lang === "ko" ? ko : en);
  const team = state.intent === "team";
  const name =
    state.name.trim() ||
    (team ? copy("Your team", "우리 팀") : copy("My workspace", "내 워크스페이스"));
  const nav = [
    { icon: House, label: copy("Home", "홈"), active: true },
    { icon: FolderClosed, label: copy("Projects", "프로젝트") },
    ...(team
      ? [
          { icon: Users, label: copy("Members", "멤버") },
          { icon: CreditCard, label: copy("Plan", "플랜과 결제") },
        ]
      : []),
    { icon: Settings, label: copy("Settings", "설정") },
  ];
  return (
    <div className={windowClass}>
      <WindowBar label="dashboard.prepix.ai" />
      <div className="grid h-[380px] grid-cols-[184px_minmax(0,1fr)]">
        <div className="space-y-4 border-r border-border bg-surface p-3">
          <div className="flex items-center gap-2.5 rounded-lg p-1.5">
            <motion.span
              key={initial(name)}
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", duration: 0.3, bounce: 0 }}
              className="grid size-7 shrink-0 place-items-center rounded-md bg-foreground text-[13px] font-semibold text-background"
            >
              {initial(name)}
            </motion.span>
            <span className="min-w-0">
              <span className="block truncate text-[13px] font-medium">{name}</span>
              <span className="block text-[11px] text-muted">
                {team ? "Business" : copy("Personal", "개인")}
              </span>
            </span>
          </div>
          <ul className="space-y-0.5">
            <AnimatePresence initial={false}>
              {nav.map(({ icon: Icon, label, active }) => (
                <motion.li
                  key={label}
                  layout
                  initial={{ opacity: 0, x: -4 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.18, ease: "easeOut" }}
                  className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-[12px] ${
                    active ? "bg-surface-secondary text-foreground" : "text-muted"
                  }`}
                >
                  <Icon size={14} strokeWidth={1.5} />
                  {label}
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        </div>
        <div className="flex flex-col gap-4 p-5">
          <div className="space-y-2">
            <div className="h-3 w-24 rounded-full bg-surface-tertiary" />
            <div className="h-2 w-40 rounded-full bg-surface-secondary" />
          </div>
          <div className="grid grid-cols-3 gap-2.5">
            {[0, 1, 2].map((i) => (
              <div key={i} className="space-y-2">
                <div className="aspect-video rounded-lg bg-surface-secondary" />
                <div className="h-2 w-3/4 rounded-full bg-surface-secondary" />
              </div>
            ))}
          </div>
          <ul className="divide-y divide-border rounded-lg border border-border">
            {[0.55, 0.4, 0.48].map((width, i) => (
              <li key={i} className="flex items-center gap-3 px-3 py-2.5">
                <span className="size-6 rounded-md bg-surface-secondary" />
                <span className="h-2 rounded-full bg-surface-tertiary" style={{ width: `${width * 100}%` }} />
                <span className="ml-auto h-2 w-10 rounded-full bg-surface-secondary" />
              </li>
            ))}
          </ul>
          <div className="mt-auto flex items-center justify-between gap-3 rounded-lg bg-surface p-3">
            <div className="flex -space-x-1.5">
              <AnimatePresence initial={false}>
                {state.people.slice(0, 6).map((person) => (
                  <motion.span
                    key={person}
                    layout
                    initial={{ scale: 0.25, opacity: 0, filter: "blur(4px)" }}
                    animate={{ scale: 1, opacity: 1, filter: "blur(0px)" }}
                    exit={{ scale: 0.25, opacity: 0, filter: "blur(4px)" }}
                    transition={{ type: "spring", duration: 0.3, bounce: 0 }}
                    className="grid size-7 place-items-center rounded-full bg-surface-tertiary text-[11px] font-medium ring-2 ring-surface"
                  >
                    {initial(person)}
                  </motion.span>
                ))}
              </AnimatePresence>
              {state.people.length > 6 && (
                <span className="grid size-7 place-items-center rounded-full bg-surface-tertiary text-[11px] ring-2 ring-surface">
                  +{state.people.length - 6}
                </span>
              )}
            </div>
            {team && state.seats ? (
              <span className="text-[12px] tabular-nums text-muted">
                {copy(`${state.seats.count} seats`, `${state.seats.count}석`)} ·{" "}
                <span className="text-foreground">{formatMoney(state.seats.supplyKrw, lang)}</span>
                {copy("/mo", "/월")}
              </span>
            ) : (
              <span className="text-[12px] text-muted">
                {team ? copy("Your team", "팀원") : copy("Only you", "나만 보는 공간")}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * The desktop app, where the editing happens. On the first-edit step it acts
 * out the step picked on the left: signing in, making a project, bringing a
 * clip in, cutting it.
 */
function AppWindow({ scene, email }: { scene: AppScene | null; email: string }) {
  return (
    <div className={windowClass}>
      <WindowBar label="Prepix" />
      <div className="relative h-[352px]">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={scene ?? "editor"}
            className="absolute inset-0"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
          >
            {scene === "open" ? (
              <SignIn email={email} />
            ) : scene === "project" ? (
              <NewProject />
            ) : scene === "import" ? (
              <Import />
            ) : (
              <Editor cutting={scene === "cut"} />
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

const ease = [0.16, 1, 0.3, 1] as const;

function useAppCopy() {
  const { lang } = useI18n();
  return (en: string, ko: string) => (lang === "ko" ? ko : en);
}

/** ① The address types itself in and the button is pressed. */
function SignIn({ email }: { email: string }) {
  const copy = useAppCopy();
  const address = email.includes("@") ? email : "you@prepix.ai";
  return (
    <div className="grid h-full place-items-center bg-surface">
      <div className="w-64 space-y-3 rounded-lg border border-border bg-background p-5">
        <span className="grid size-8 place-items-center rounded-md bg-foreground text-[13px] font-semibold text-background">
          P
        </span>
        <p className="text-[13px] font-medium">{copy("Sign in to Prepix", "Prepix에 로그인")}</p>
        <div className="flex h-8 items-center gap-2 rounded-md border border-border px-2.5">
          <span className="size-3.5 rounded-full border-[3px] border-surface-tertiary" />
          <span className="h-2 w-28 rounded-full bg-surface-secondary" />
        </div>
        <div className="flex h-8 items-center overflow-hidden rounded-md border border-foreground/40 px-2.5">
          <motion.span
            className="truncate whitespace-nowrap text-[12px]"
            initial={{ clipPath: "inset(0 100% 0 0)" }}
            animate={{ clipPath: "inset(0 0% 0 0)" }}
            transition={{ delay: 0.3, duration: 1, ease: "linear" }}
          >
            {address}
          </motion.span>
          <motion.span
            className="ml-px h-3.5 w-px bg-foreground"
            animate={{ opacity: [1, 0, 1] }}
            transition={{ duration: 1, repeat: Infinity }}
          />
        </div>
        <motion.div
          className="grid h-8 place-items-center rounded-md bg-foreground text-[12px] font-medium text-background"
          initial={{ scale: 1 }}
          animate={{ scale: [1, 0.96, 1] }}
          transition={{ delay: 1.5, duration: 0.3 }}
        >
          {copy("Continue", "계속하기")}
        </motion.div>
      </div>
    </div>
  );
}

/** ② A workflow card is chosen for the new project. */
function NewProject() {
  const copy = useAppCopy();
  const kinds = [Clapperboard, Smartphone, Mic];
  return (
    <div className="grid h-full place-items-center bg-surface">
      <div className="w-[min(420px,85%)] space-y-4 rounded-lg border border-border bg-background p-5">
        <p className="text-[13px] font-medium">{copy("New project", "새 프로젝트")}</p>
        <div className="grid grid-cols-3 gap-2.5">
          {kinds.map((Icon, i) => (
            <motion.div
              key={i}
              className="space-y-2.5 rounded-lg border border-border p-3"
              initial={{ opacity: 0, y: 6 }}
              animate={
                i === 0
                  ? { opacity: 1, y: 0, borderColor: ["var(--border)", "var(--border)", "var(--foreground)"] }
                  : { opacity: 1, y: 0 }
              }
              transition={{ delay: 0.1 + i * 0.08, duration: i === 0 ? 1 : 0.3, ease }}
            >
              <span className="grid size-8 place-items-center rounded-md bg-surface-secondary">
                <Icon size={15} strokeWidth={1.5} />
              </span>
              <span className="block h-2 w-3/4 rounded-full bg-surface-tertiary" />
              <span className="block h-1.5 w-full rounded-full bg-surface-secondary" />
            </motion.div>
          ))}
        </div>
        <motion.div
          className="ml-auto grid h-8 w-24 place-items-center rounded-md bg-foreground text-[12px] font-medium text-background"
          initial={{ opacity: 0.4 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1, duration: 0.3 }}
        >
          {copy("Create", "만들기")}
        </motion.div>
      </div>
    </div>
  );
}

/** ③ One clip drops into the media panel, loads, and lands on the timeline. */
function Import() {
  const copy = useAppCopy();
  return (
    <div className="grid h-full grid-cols-[180px_minmax(0,1fr)] gap-3 p-4">
      <div className="space-y-2.5 rounded-lg bg-surface p-2.5">
        <p className="text-[11px] font-medium text-muted">{copy("Media", "미디어")}</p>
        <motion.div
          className="space-y-1.5 rounded-md bg-background p-1.5"
          initial={{ opacity: 0, y: -48, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ delay: 0.2, type: "spring", duration: 0.6, bounce: 0.2 }}
        >
          <div className="grid aspect-video place-items-center rounded bg-foreground/[0.85] text-background/80">
            <Film size={16} strokeWidth={1.5} />
          </div>
          <div className="h-1 overflow-hidden rounded-full bg-surface-tertiary">
            <motion.div
              className="h-full origin-left rounded-full bg-foreground"
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ delay: 0.6, duration: 0.9, ease: "easeOut" }}
            />
          </div>
        </motion.div>
        <div className="grid h-16 place-items-center rounded-md border border-dashed border-border text-[11px] text-muted">
          {copy("Drop a clip", "영상을 끌어다 놓기")}
        </div>
      </div>
      <div className="flex flex-col gap-3">
        <div className="grid flex-1 place-items-center rounded-lg bg-foreground/[0.92]">
          <motion.span
            className="size-0 translate-x-0.5 border-y-[9px] border-l-[14px] border-y-transparent border-l-background/80"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.6 }}
          />
        </div>
        <div className="space-y-1.5 rounded-lg bg-surface p-2.5">
          <motion.div
            className="h-5 w-[62%] origin-left rounded bg-foreground/80"
            initial={{ scaleX: 0, opacity: 0 }}
            animate={{ scaleX: 1, opacity: 1 }}
            transition={{ delay: 1.5, duration: 0.4, ease }}
          />
          <div className="h-5 w-[62%] rounded bg-surface-tertiary/60" />
        </div>
      </div>
    </div>
  );
}

/**
 * The editor. On ④ the playhead runs, the clip under it splits, and export
 * lights up — the first cut. Otherwise (the install step) it just sits there.
 */
function Editor({ cutting }: { cutting: boolean }) {
  const copy = useAppCopy();
  const tracks = [
    [8, 22, 14, 30],
    [18, 12, 26, 20],
    [40, 34],
  ];
  return (
    <div className="space-y-3 p-4">
      <div className="grid grid-cols-[minmax(0,1fr)_132px] gap-3">
        <div className="grid aspect-video place-items-center rounded-lg bg-foreground/[0.92]">
          <span className="size-0 translate-x-0.5 border-y-[9px] border-l-[14px] border-y-transparent border-l-background/80" />
        </div>
        <div className="flex flex-col gap-2 rounded-lg bg-surface p-2.5">
          {[0.9, 0.7, 0.8, 0.5].map((width, i) => (
            <div
              key={i}
              className="h-2 rounded-full bg-surface-tertiary"
              style={{ width: `${width * 100}%` }}
            />
          ))}
          {cutting && (
            <motion.span
              className="mt-auto grid h-7 place-items-center rounded-md bg-foreground text-[11px] font-medium text-background"
              initial={{ opacity: 0.25 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 2.2, duration: 0.3 }}
            >
              {copy("Export", "내보내기")}
            </motion.span>
          )}
        </div>
      </div>
      <div className="rounded-lg bg-surface p-2.5">
        <div className="relative space-y-1.5">
          {tracks.map((clips, row) => (
            <div key={row} className="flex gap-1">
              {clips.map((width, i) =>
                // The clip the playhead stops in comes apart there: the cut.
                cutting && row === 0 && i === 1 ? (
                  <div key={i} className="flex h-5" style={{ width: `${width}%` }}>
                    <span className="flex-1 rounded-l bg-foreground/80" />
                    <motion.span
                      className="flex-1 rounded-r bg-foreground/80"
                      initial={{ marginLeft: 0 }}
                      animate={{ marginLeft: 8 }}
                      transition={{ delay: 1.6, duration: 0.3, ease }}
                    />
                  </div>
                ) : (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, scaleX: 0.6 }}
                    animate={{ opacity: 1, scaleX: 1 }}
                    transition={{ delay: 0.1 + (row * 4 + i) * 0.04, duration: 0.24, ease: "easeOut" }}
                    className={`h-5 origin-left rounded ${row === 2 ? "bg-surface-tertiary" : "bg-foreground/80"}`}
                    style={{ width: `${width}%` }}
                  />
                ),
              )}
            </div>
          ))}
          {cutting && (
            <motion.div
              className="pointer-events-none absolute inset-y-0 w-px bg-foreground"
              initial={{ left: "2%" }}
              animate={{ left: "19.7%" }}
              transition={{ duration: 1.5, ease: "easeInOut" }}
            >
              <motion.span
                className="absolute -top-1 left-1/2 grid size-5 -translate-x-1/2 -translate-y-full place-items-center rounded-full border border-border bg-background text-foreground"
                initial={{ scale: 0 }}
                animate={{ scale: [0, 1.15, 1] }}
                transition={{ delay: 1.5, duration: 0.35 }}
              >
                <Scissors size={11} strokeWidth={2} />
              </motion.span>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}
