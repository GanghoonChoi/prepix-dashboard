"use client";

import { useState, useSyncExternalStore } from "react";
import { Monitor, Moon, Sun, type LucideIcon } from "lucide-react";
import { useI18n } from "@/lib/i18n/context";
import { applyTheme, savedTheme, type ThemeChoice } from "@/lib/theme";

const subscribeNone = () => () => {};

// Segmented system / light / dark, the twin of LanguageSwitcher.
export function ThemeSwitcher() {
  const { lang } = useI18n();
  const ko = lang === "ko";
  // localStorage is client-only: "system" on the server, the saved choice
  // after hydration, then whatever is picked here.
  const stored = useSyncExternalStore(subscribeNone, savedTheme, () => "system" as const);
  const [picked, setPicked] = useState<ThemeChoice | null>(null);
  const theme = picked ?? stored;
  const options: { key: ThemeChoice; label: string; Icon: LucideIcon }[] = [
    { key: "system", label: ko ? "시스템" : "System", Icon: Monitor },
    { key: "light", label: ko ? "라이트" : "Light", Icon: Sun },
    { key: "dark", label: ko ? "다크" : "Dark", Icon: Moon },
  ];
  return (
    <div
      role="group"
      aria-label={ko ? "테마" : "Theme"}
      className="inline-flex rounded-md border border-border p-0.5"
    >
      {options.map(({ key, label, Icon }) => (
        <button
          key={key}
          type="button"
          title={label}
          aria-label={label}
          aria-pressed={theme === key}
          onClick={() => {
            applyTheme(key);
            setPicked(key);
          }}
          className={`grid h-6 w-7 place-items-center rounded transition-colors ${
            theme === key ? "bg-foreground text-background" : "text-muted hover:text-foreground"
          }`}
        >
          <Icon size={13} strokeWidth={1.75} aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}
