import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n";

const STORAGE_KEY = "nl.onboarded";

export function OnboardingOverlay() {
  const t = useT();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!localStorage.getItem(STORAGE_KEY)) setOpen(true);
  }, []);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-neutral-900/70 flex items-end sm:items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
    >
      <div className="w-full max-w-sm rounded-2xl bg-white shadow-xl p-6 text-neutral-900">
        <h1 id="onboarding-title" className="text-xl font-semibold">
          {t("app.title")}
        </h1>
        <p className="mt-3 text-sm text-neutral-700">
          {t("app.tagline")}
          <br />
          {t("app.subtitle")}
        </p>
        <p className="mt-4 text-sm text-red-700">{t("onboarding.emergency")}</p>
        <button
          type="button"
          className="mt-6 w-full rounded-xl bg-neutral-900 px-4 py-3 text-sm font-medium text-white hover:bg-neutral-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-neutral-900"
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
