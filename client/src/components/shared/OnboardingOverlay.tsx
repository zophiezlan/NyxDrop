import { useCallback, useEffect, useRef, useState } from "react";
import { useT } from "@/lib/i18n";

const STORAGE_KEY = "nl.onboarded";

export function OnboardingOverlay() {
  const t = useT();
  const [open, setOpen] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!localStorage.getItem(STORAGE_KEY)) setOpen(true);
  }, []);

  const trapFocus = useCallback((e: KeyboardEvent) => {
    if (e.key !== "Tab" || !dialogRef.current) return;
    const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    if (focusable.length === 0) return;
    const first = focusable[0]!;
    const last = focusable[focusable.length - 1]!;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    window.addEventListener("keydown", trapFocus);
    return () => window.removeEventListener("keydown", trapFocus);
  }, [open, trapFocus]);

  if (!open) return null;

  return (
    <div
      ref={dialogRef}
      className="fixed inset-0 z-50 bg-neutral-900/70 flex items-end sm:items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
    >
      <div className="w-full max-w-sm rounded-2xl bg-surface shadow-xl p-6 text-fg">
        <h1 id="onboarding-title" className="text-xl font-semibold">
          {t("app.title")}
        </h1>
        <p className="mt-3 text-sm text-fg-secondary">
          {t("app.tagline")}
          <br />
          {t("app.subtitle")}
        </p>
        <p className="mt-4 text-sm text-red-700 dark:text-red-400">{t("onboarding.emergency")}</p>
        <button
          type="button"
          className="mt-6 w-full rounded-xl bg-nl-primary px-4 py-3 text-sm font-medium text-nl-on-primary hover:bg-nl-primary-hover active:scale-[0.97] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-nl-primary transition-transform"
          onClick={() => {
            localStorage.setItem(STORAGE_KEY, "true");
            setOpen(false);
          }}
        >
          {t("onboarding.continue")}
        </button>
      </div>
    </div>
  );
}
