import { Call000Button } from "./Call000Button.js";
import { DrsabcdCard } from "./DrsabcdCard.js";
import { useT } from "@/lib/i18n";

interface NowModeOverlayProps {
  /** Restore Plan mode without losing map state. */
  onExit: () => void;
}

/**
 * The Now-mode shell: prominent Call 000 button at top, DRSABCD card at
 * bottom, and an "I'm OK now" exit anchored to the right edge. The map
 * (and a single-tapped pin's minimal sheet) sit between them.
 */
export function NowModeOverlay({ onExit }: NowModeOverlayProps) {
  const t = useT();
  return (
    <>
      <Call000Button />
      <DrsabcdCard />
      <button
        type="button"
        onClick={onExit}
        aria-label="I am OK now — return to Plan mode"
        className="fixed top-20 end-3 z-40 rounded-full bg-surface px-3 py-1.5 text-xs font-medium text-fg shadow-lg ring-1 ring-nl-ring hover:bg-nl-hover active:scale-95 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-nl-primary transition-transform"
      >
        {t("mode.exit_now")}
      </button>
    </>
  );
}
