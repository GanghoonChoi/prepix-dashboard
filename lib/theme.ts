/**
 * The reader's colour-scheme choice. `app/layout.tsx` reads the same key
 * before the first paint (PICK_SCHEME); this writes it and repaints in place.
 * "system" is the absence of a choice, so it removes the key.
 */
export type ThemeChoice = "system" | "light" | "dark";

export const THEME_KEY = "px-theme";

export function savedTheme(): ThemeChoice {
  try {
    const value = localStorage.getItem(THEME_KEY);
    return value === "light" || value === "dark" ? value : "system";
  } catch {
    return "system";
  }
}

export function applyTheme(choice: ThemeChoice) {
  try {
    if (choice === "system") localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, choice);
  } catch {
    /* private window: the choice lasts until reload */
  }
  const scheme =
    choice === "system"
      ? window.matchMedia("(prefers-color-scheme: light)").matches
        ? "light"
        : "dark"
      : choice;
  const root = document.documentElement;
  root.classList.toggle("dark", scheme === "dark");
  root.classList.toggle("light", scheme === "light");
  root.dataset.theme = scheme;
}
