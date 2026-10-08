"use client";
import { AnimatePresence, motion } from "framer-motion";
import {
  CreditCard,
  FolderClosed,
  House,
  Settings,
  Users,
} from "lucide-react";
import { useI18n } from "@/lib/i18n/context";
import type { Intent } from "@/lib/onboarding";

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
};

const won = (value: number) =>
  `₩${new Intl.NumberFormat("ko-KR").format(value)}`;
const initial = (value: string) =>
  (value.trim()[0] ?? "P").toLocaleUpperCase();

const windowClass =
  "relative w-[min(660px,100%)] overflow-hidden rounded-l-2xl bg-background shadow-[0_0_0_1px_var(--border),0_12px_32px_-12px_rgb(0_0_0/0.18),0_40px_80px_-32px_rgb(0_0_0/0.22)]";

export function StartPreview({ state }: { state: PreviewState }) {
  return (
    <aside
      aria-hidden="true"
      className="relative hidden overflow-hidden border-l border-border bg-surface lg:flex lg:items-center lg:justify-end lg:py-12 lg:pl-12"
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
          {state.surface === "app" ? <AppWindow /> : <WorkspaceWindow state={state} />}
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
      <div className="grid h-[440px] grid-cols-[184px_minmax(0,1fr)]">
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
          <div className="mt-auto flex items-center justify-between gap-3 rounded-xl bg-surface p-3">
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
                <span className="grid size-7 place-items-center rounded-full bg-surface-tertiary text-[10px] ring-2 ring-surface">
                  +{state.people.length - 6}
                </span>
              )}
            </div>
            {team && state.seats ? (
              <span className="text-[12px] tabular-nums text-muted">
                {copy(`${state.seats.count} seats`, `${state.seats.count}석`)} ·{" "}
                <span className="text-foreground">{won(state.seats.supplyKrw)}</span>
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

/** The desktop app, where the editing happens — drawn for the app steps. */
function AppWindow() {
  const tracks = [
    [8, 22, 14, 30],
    [18, 12, 26, 20],
    [40, 34],
  ];
  return (
    <div className={windowClass}>
      <WindowBar label="Prepix" />
      <div className="space-y-3 p-4">
        <div className="grid grid-cols-[minmax(0,1fr)_132px] gap-3">
          <div className="grid aspect-video place-items-center rounded-lg bg-foreground/[0.92]">
            <span className="size-0 border-y-[9px] border-l-[14px] border-y-transparent border-l-background/80 translate-x-0.5" />
          </div>
          <div className="space-y-2 rounded-lg bg-surface p-2.5">
            {[0.9, 0.7, 0.8, 0.5].map((width, i) => (
              <div
                key={i}
                className="h-2 rounded-full bg-surface-tertiary"
                style={{ width: `${width * 100}%` }}
              />
            ))}
          </div>
        </div>
        <div className="space-y-1.5 rounded-lg bg-surface p-2.5">
          {tracks.map((clips, row) => (
            <div key={row} className="flex gap-1">
              {clips.map((width, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, scaleX: 0.6 }}
                  animate={{ opacity: 1, scaleX: 1 }}
                  transition={{ delay: 0.1 + (row * 4 + i) * 0.04, duration: 0.24, ease: "easeOut" }}
                  className={`h-5 origin-left rounded ${row === 2 ? "bg-surface-tertiary" : "bg-foreground/80"}`}
                  style={{ width: `${width}%` }}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
