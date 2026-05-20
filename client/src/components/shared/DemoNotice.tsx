import { useEffect, useRef, useState } from "react";
import { IS_DEMO } from "@/lib/demo";
import { useT } from "@/lib/i18n";

/**
 * Persistent corner pill that re-opens the demo explanation. Hidden when
 * IS_DEMO is false so a future production build drops it automatically.
 */
export function DemoChip({ hidden }: { hidden?: boolean }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  if (!IS_DEMO || hidden) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t("demo.chip_aria")}
        title={t("demo.chip_aria")}
        className="fixed top-14 start-3 z-30 inline-flex items-center gap-1.5 rounded-full bg-amber-100 dark:bg-amber-950 px-2.5 py-1 text-[11px] font-medium text-amber-900 dark:text-amber-200 shadow-md ring-1 ring-amber-300 dark:ring-amber-800 hover:bg-amber-200 dark:hover:bg-amber-900 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-amber-600"
      >
        <span aria-hidden="true">⚠</span>
        <span>{t("demo.chip")}</span>
      </button>
      {open ? <DemoDialog onClose={() => setOpen(false)} /> : null}
    </>
  );
}

/**
 * Inline strip used inside sheets (DetailSheet recent-reports area, NowMode
 * overlay). Caller picks the message key so the wording fits the surface.
 */
export function DemoStrip({
  messageKey,
  tone = "amber",
}: {
  messageKey: "demo.detail_strip" | "demo.now_strip";
  tone?: "amber" | "red";
}) {
  const t = useT();
  if (!IS_DEMO) return null;
  const cls =
    tone === "red"
      ? "border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950 text-red-900 dark:text-red-200"
      : "border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950 text-amber-900 dark:text-amber-200";
  return (
    <div
      role="note"
      className={`mt-3 flex items-start gap-2 rounded-lg border px-3 py-2 text-xs ${cls}`}
    >
      <span aria-hidden="true">⚠</span>
      <span>{t(messageKey)}</span>
    </div>
  );
}

function DemoDialog({ onClose }: { onClose: () => void }) {
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 bg-neutral-900/70 flex items-end sm:items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="demo-dialog-title"
      onClick={onClose}
    >
      <div
        ref={ref}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-2xl bg-surface shadow-xl p-6 text-fg outline-none"
      >
        <h2 id="demo-dialog-title" className="text-lg font-semibold">
          {t("demo.onboarding_title")}
        </h2>
        <p className="mt-3 text-sm text-fg-secondary">{t("demo.onboarding_body")}</p>
        <button
          type="button"
          onClick={onClose}
          className="mt-5 w-full rounded-xl bg-nl-primary px-4 py-2.5 text-sm font-medium text-nl-on-primary hover:bg-nl-primary-hover focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-nl-primary"
        >
          {t("demo.dialog_close")}
        </button>
      </div>
    </div>
  );
}
