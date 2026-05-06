import type { AppMode } from "@/hooks/use-mode";
import { useT } from "@/lib/i18n";

interface ModeToggleProps {
  mode: AppMode;
  onChange: (m: AppMode) => void;
  hidden?: boolean;
}

/**
 * Two-segment Plan / Now toggle, sticky just below the top edge in Plan
 * mode. In Now mode it's hidden — the user exits via "I'm OK now" instead,
 * which uses non-judgmental language (vision.md). Keyboard shortcut Ctrl+E
 * mirrors this toggle and is wired in the route.
 */
export function ModeToggle({ mode, onChange, hidden }: ModeToggleProps) {
  const t = useT();
  if (hidden) return null;
  return (
    <div className="fixed top-3 left-3 z-30 inline-flex rounded-full bg-surface shadow-lg ring-1 ring-nl-ring p-0.5">
      <button
        type="button"
        onClick={() => onChange("plan")}
        aria-pressed={mode === "plan"}
        className={`rounded-full px-3 py-1.5 text-sm transition-colors ${
          mode === "plan"
            ? "bg-nl-primary text-nl-on-primary"
            : "text-fg-secondary hover:bg-nl-hover"
        }`}
      >
        {t("mode.plan")}
      </button>
      <button
        type="button"
        onClick={() => onChange("now")}
        aria-pressed={mode === "now"}
        className={`rounded-full px-3 py-1.5 text-sm transition-colors ${
          mode === "now"
            ? "bg-red-700 text-white"
            : "text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950"
        }`}
      >
        {t("mode.now")}
      </button>
    </div>
  );
}
