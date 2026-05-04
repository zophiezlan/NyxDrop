import { useEffect } from "react";

export interface ToastProps {
  message: string;
  /** Tone affects colour. Default is "info" (neutral dark). */
  tone?: "info" | "warn";
  /** Auto-dismiss after this many ms. Default 5000. Set 0 to disable. */
  duration?: number;
  onClose: () => void;
}

/**
 * One-line acknowledgment toast anchored above the bottom action bar (spec
 * §6.6). Single line, no celebration imagery, no confetti. Constitution VIII:
 * "the reward for contributing a report is one line of acknowledgment".
 */
export function Toast({ message, tone = "info", duration = 5000, onClose }: ToastProps) {
  useEffect(() => {
    if (duration <= 0) return;
    const t = setTimeout(onClose, duration);
    return () => clearTimeout(t);
  }, [duration, onClose]);

  const toneClasses =
    tone === "warn"
      ? "bg-amber-100 text-amber-900 ring-amber-200"
      : "bg-neutral-900 text-white ring-neutral-800";

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-0 bottom-24 z-40 px-3 pointer-events-none"
    >
      <div
        className={`mx-auto max-w-md rounded-xl px-4 py-3 text-sm shadow-xl ring-1 pointer-events-auto ${toneClasses}`}
      >
        <div className="flex items-start justify-between gap-3">
          <span>{message}</span>
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
  );
}
