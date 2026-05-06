import { useEffect } from "react";

export interface ToastProps {
  message: string;
  /** Tone affects colour. Default is "info" (neutral dark). */
  tone?: "info" | "warn";
  /** Auto-dismiss after this many ms. Default 5000. Set 0 to disable. */
  duration?: number;
  /** Optional action button. When set, the toast becomes tappable. */
  actionLabel?: string;
  onAction?: () => void;
  onClose: () => void;
}

/**
 * One-line acknowledgment toast anchored above the bottom action bar (spec
 * §6.6). Single line, no celebration imagery, no confetti. Constitution VIII:
 * "the reward for contributing a report is one line of acknowledgment".
 */
export function Toast({
  message,
  tone = "info",
  duration = 5000,
  actionLabel,
  onAction,
  onClose,
}: ToastProps) {
  useEffect(() => {
    if (duration <= 0) return;
    const t = setTimeout(onClose, duration);
    return () => clearTimeout(t);
  }, [duration, onClose]);

  const toneClasses =
    tone === "warn"
      ? "bg-amber-100 dark:bg-amber-950 text-amber-900 dark:text-amber-200 ring-amber-200 dark:ring-amber-800"
      : "bg-nl-primary text-nl-on-primary ring-nl-primary";

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-0 bottom-24 z-40 px-3 pointer-events-none"
    >
      <div
        className={`mx-auto max-w-md rounded-xl px-4 py-3 text-sm shadow-xl ring-1 pointer-events-auto ${toneClasses}`}
      >
        <div className="flex items-center justify-between gap-3">
          <span>{message}</span>
          <div className="flex items-center gap-2">
            {actionLabel && onAction ? (
              <button
                type="button"
                onClick={onAction}
                className="rounded-md bg-white/10 px-2 py-1 text-xs font-medium underline hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-current"
              >
                {actionLabel}
              </button>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              className="text-current opacity-70 hover:opacity-100 focus:outline-none focus:underline"
              aria-label="Dismiss"
            >
              ✕
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
